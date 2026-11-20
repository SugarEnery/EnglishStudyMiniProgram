import { createHash, randomBytes } from 'node:crypto';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { tokens, type DailyBatch } from '../src/shared/daily-types';
import { includesWord } from '../src/shared/lexical';
import type { StudyEvent } from '../src/shared/study-types';
import { eventSchema, studyEventsSchema } from '../src/shared/study-schema';
import {scoreRecall,comparableEvent} from '../src/shared/recall';
import {quizQuestions} from '../src/shared/quiz-questions';
export type { StudyEvent } from '../src/shared/study-types';
export { eventSchema } from '../src/shared/study-schema';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type State = { version: 1; sessions: Record<string, { user: string; expiresAt: number }>; users: Record<string, StudyEvent[]> };
const stateSchema = z.object({ version: z.literal(1), sessions: z.record(z.object({ user: z.string().min(1), expiresAt: z.number().finite() }).strict()), users: z.record(studyEventsSchema) }).strict();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export type Exchange = (code: string) => Promise<string>;

export function wechatExchange(env: NodeJS.ProcessEnv = process.env): Exchange {
  return async code => {
    if (!env.WX_APP_ID || !env.WX_APP_SECRET) throw new ApiError(503, '请在后端配置真实 WX_APP_ID 和 WX_APP_SECRET 后再登录');
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.search = new URLSearchParams({ appid: env.WX_APP_ID, secret: env.WX_APP_SECRET, js_code: code, grant_type: 'authorization_code' }).toString();
    let response: Response;
    try { response = await fetch(url, { signal: AbortSignal.timeout(10000) }); }
    catch { throw new ApiError(502, '微信登录服务连接失败'); }
    if (!response.ok) throw new ApiError(502, '微信登录服务返回异常');
    let result: { openid?: unknown; errcode?: unknown };
    try { result = await response.json() as typeof result; }
    catch { throw new ApiError(502, '微信登录服务响应格式异常'); }
    if (!result || typeof result !== 'object') throw new ApiError(502, '微信登录服务响应格式异常');
    if (result.errcode || typeof result.openid !== 'string' || !result.openid) throw new ApiError(401, '微信登录凭证无效，请重新登录');
    return result.openid;
  };
}

export class StudyService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string, public courses: DailyBatch[], private exchange: Exchange = wechatExchange()) {}
  private async load(): Promise<State> {
    try { return stateSchema.parse(JSON.parse(await readFile(this.file, 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, sessions: {}, users: {} };
      if(error instanceof z.ZodError)throw new Error('学习记录持久文件结构损坏');
      throw error;
    }
  }
  private transaction<T>(action: (state: State) => T | Promise<T>, write = false): Promise<T> {
    const run = this.queue.then(async () => {
      const state = await this.load();
      const result = await action(state);
      if (write) {
        await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
        const temporary = `${this.file}.${randomBytes(8).toString('hex')}.tmp`;
        await writeFile(temporary, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
        await rename(temporary, this.file);
      }
      return result;
    });
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }
  async login(input: unknown) {
    const { code } = z.object({ code: z.string().trim().min(1).max(512) }).strict().parse(input);
    const user = await this.exchange(code);
    if (!user) throw new ApiError(502, '微信身份缺失');
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 7 * 86400000;
    await this.transaction(state => {
      for (const [key, value] of Object.entries(state.sessions)) if (value.expiresAt <= Date.now()) delete state.sessions[key];
      state.sessions[hash(token)] = { user: hash(user), expiresAt };
    }, true);
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }
  private user(state: State, token: string): string {
    const session = state.sessions[hash(token)];
    if (!session || session.expiresAt <= Date.now()) throw new ApiError(401, '登录已失效，请重新登录');
    return session.user;
  }
  events(token: string) { return this.transaction(state => ({ events: state.users[this.user(state, token)] ?? [] })); }
  account(token: string) { return this.transaction(state => this.user(state, token)); }
  revoke(token:string) {
    if(!/^[a-f0-9]{64}$/.test(token))throw new ApiError(401,'请先登录');
    return this.transaction(state=>{delete state.sessions[hash(token)];return {ok:true as const};},true);
  }
  saveEvent(token: string, input: unknown) {
    const event = eventSchema.parse(input);
    const course = this.courses.find(c => c.day === event.day);
    const lesson = course?.content.lessons.find(l => l.id === event.lessonId);
    if (!course || !lesson) throw new ApiError(400, '学习日或情境不存在');
    const questions=event.type==='quiz'?quizQuestions(lesson,event.quizVersion):[];
    let recall:{answers:number[];score:number}|undefined;
    if(event.type==='recall'){try{recall=scoreRecall(event,course);}catch(error){throw new ApiError(400,(error as Error).message);}}
    else if (event.answerText!==undefined)throw new ApiError(400,'此记录类型不接受回忆作答文本');
    else if (event.type === 'quiz') {
      if (!event.answers || event.answers.length !== questions.length || event.word !== undefined || event.favorite !== undefined) throw new ApiError(400, '测验答案数量或字段无效');
    } else if (event.type === 'favorite') {
      const vocabulary = new Set(lesson.paragraphs.flatMap(p => tokens(p.en)));
      if (!event.word || !course.content.dictionary[event.word] || (!vocabulary.has(event.word) && !lesson.paragraphs.some(p => includesWord(p.en, event.word!))) || event.favorite === undefined || event.answers !== undefined) throw new ApiError(400, '收藏单词或字段无效');
    } else if (event.word !== undefined || event.favorite !== undefined || event.answers !== undefined) throw new ApiError(400, '阅读记录字段无效');
    return this.transaction(state => {
      const user = this.user(state, token);
      const events = state.users[user] ?? [];
      const existing = events.find(e => e.id === event.id);
      if (existing) {
        const { createdAt: _, score: __, ...original } = existing;
        if (JSON.stringify(comparableEvent(original)) !== JSON.stringify(comparableEvent(event))) throw new ApiError(409, '记录编号已被其他内容使用');
        return { event: existing };
      }
      if (events.length >= 100000) throw new ApiError(413, '个人学习记录已达首版容量上限，请联系维护者');
      const saved: StudyEvent = { ...event, createdAt: new Date().toISOString() };
      if(recall)Object.assign(saved,recall);
      if (event.type === 'quiz') saved.score = event.answers!.filter((answer, index) => answer === questions[index].answer).length;
      events.push(saved);
      state.users[user] = events;
      return { event: saved };
    }, true);
  }
}
