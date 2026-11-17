import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat,realpath } from 'node:fs/promises';
import { resolve, sep,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';
import { plan, wordsForDay, dateForDay } from '../src/shared/daily-plan';
import { validateBatch } from '../src/shared/daily-validation';
import { ApiError, StudyService } from './service';
import {ProfileService} from './profile-service';
import {PersonalPlanService} from './personal-plan-service';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export async function loadCourses() {
  const days=z.array(z.number().int().positive()).min(1).refine(items=>items.every((day,index)=>day===index+1),'课程目录必须从第1天开始连续排列').parse(JSON.parse(await readFile(resolve(root,'src/content/catalog.json'),'utf8')));
  return Promise.all(days.map(async day => {
    const batch=validateBatch(JSON.parse(await readFile(resolve(root, `src/content/day${day}.json`), 'utf8')), wordsForDay(day));
    if(batch.day!==day||batch.date!==dateForDay(day)||batch.content.lessons.length!==6)throw Error(`第${day}天课程日期或情境数量无效`);
    return batch;
  }));
}
async function body(request: IncomingMessage,limit=16384) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, '请使用 JSON 请求');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw new ApiError(413, '请求内容过大');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new ApiError(400, 'JSON 内容无效'); }
}
function bearer(request: IncomingMessage) {
  const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.authorization ?? '')?.[1];
  if (!token) throw new ApiError(401, '请先登录');
  return token;
}
export function createApi(service: StudyService, audioDirectory = resolve(root, 'audio'),profiles=new ProfileService(resolve(root,'.data/profiles.json')),personalPlans=new PersonalPlanService(resolve(root,'.data/plans.json'))) {
  const recentLogins = new Map<string, { count: number; until: number }>();
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(value));
    };
    try {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if(pathname==='/api/session/logout'){
        if(request.method!=='POST')throw new ApiError(405,'请求方法不支持');
        return send(200,await service.revoke(bearer(request)));
      }
      if(pathname==='/api/plan/update'){
        const account=await service.account(bearer(request));
        if(request.method==='POST')return send(200,await personalPlans.update(account,await body(request)));
        throw new ApiError(405,'请求方法不支持');
      }
      if(pathname==='/api/plan'){
        const account=await service.account(bearer(request));
        if(request.method==='GET')return send(200,await personalPlans.get(account));
        if(request.method==='POST')return send(200,await personalPlans.create(account,await body(request)));
        throw new ApiError(405,'请求方法不支持');
      }
      if(pathname==='/api/profile'||pathname==='/api/profile/avatar'){
        const account=await service.account(bearer(request));
        if(pathname==='/api/profile'&&request.method==='GET')return send(200,await profiles.get(account));
        if(pathname==='/api/profile'&&request.method==='POST')return send(200,await profiles.patch(account,await body(request)));
        if(pathname==='/api/profile/avatar'&&request.method==='PUT')return send(200,await profiles.putAvatar(account,await body(request,720*1024)));
        if(pathname==='/api/profile/avatar'&&request.method==='GET'){
          const avatar=await profiles.avatar(account);response.writeHead(200,{'Content-Type':'image/png','Content-Length':avatar.length,'Cache-Control':'private, no-store'});response.end(avatar);return;
        }
        throw new ApiError(405,'请求方法不支持');
      }
      if (request.method === 'GET' && pathname.startsWith('/audio/')) {
        let relative: string;
        try { relative = decodeURIComponent(pathname.slice(7)); } catch { throw new ApiError(400, '音频地址无效'); }
        const file = resolve(audioDirectory, relative);
        if (!file.startsWith(resolve(audioDirectory) + sep) || !relative.endsWith('.mp3')) throw new ApiError(404, '音频不存在');
        let audio: Buffer;
        try {
          const [directoryPath,filePath]=await Promise.all([realpath(audioDirectory),realpath(file)]);
          if(!filePath.startsWith(directoryPath+sep)||(await stat(filePath)).isFile()===false)throw new Error('音频真实路径越界或不是文件');
          audio = await readFile(filePath);
        } catch { throw new ApiError(404, '音频尚未制作或未上传'); }
        response.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length });
        response.end(audio);
        return;
      }
      if (request.method === 'GET' && pathname === '/api/days') return send(200, { days: service.courses.map(c => ({ day: c.day, date: c.date, words: c.words.length,targetWords:[...c.words] })), plan });
      if (request.method === 'GET' && /^\/api\/days\/[1-9]\d*$/.test(pathname)) {
        const day = Number(pathname.split('/').pop());
        const course = service.courses.find(c => c.day === day);
        if (!course) throw new ApiError(404, '当天课程尚未发布');
        return send(200, course);
      }
      if (request.method === 'POST' && pathname === '/api/session') {
        const now = Date.now();
        for (const [key, record] of recentLogins) if (record.until <= now) recentLogins.delete(key);
        const address = request.socket.remoteAddress ?? 'unknown';
        const record = recentLogins.get(address) ?? { count: 0, until: now + 60000 };
        record.count++;
        recentLogins.set(address, record);
        if (record.count > 20) throw new ApiError(429, '登录过于频繁，请稍后重试');
        return send(200, await service.login(await body(request)));
      }
      if (request.method === 'GET' && pathname === '/api/events') return send(200, await service.events(bearer(request)));
      if (request.method === 'POST' && pathname === '/api/events') {
        const token=bearer(request);await service.account(token);
        return send(200,await service.saveEvent(token,await body(request)));
      }
      throw new ApiError(404, '接口不存在');
    } catch (error) {
      const status = error instanceof ApiError ? error.status : error instanceof ZodError ? 400 : 500;
      send(status, { error: status === 500 ? '服务器内部错误，请检查服务日志' : error instanceof Error ? error.message : '请求失败' });
      if (status === 500) console.error('后端请求失败', error instanceof Error ? error.name : 'UnknownError');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataFile=process.env.STUDY_DATA_FILE ?? resolve(root, '.data/state.json');
  const service = new StudyService(dataFile, await loadCourses());
  const port = Number(process.env.PORT ?? 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 无效');
  createApi(service,resolve(root,'audio'),new ProfileService(process.env.PROFILE_DATA_FILE??resolve(dirname(dataFile),'profiles.json')),new PersonalPlanService(process.env.PLAN_DATA_FILE??resolve(dirname(dataFile),'plans.json'))).listen(port, '127.0.0.1', () => console.log(`学习服务已启动：http://127.0.0.1:${port}`));
}
