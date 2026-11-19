import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { StudyService, wechatExchange } from './service';
import { loadCourses, createApi } from './index';
import {includesWord} from '../src/shared/lexical';

const courses = await loadCourses();
async function setup() {
  const folder = await mkdtemp(join(tmpdir(), 'miniapp-server-'));
  const file = join(folder, 'state.json');
  // 只在测试注入微信交换器，不对运行服务暴露测试登录入口。
  return { file, service: new StudyService(file, courses, async code => code) };
}
const reading = () => ({ id: randomUUID(), day: 1, lessonId: courses[0].content.lessons[0].id, type: 'read' as const });
test('回忆评分来自文本，空答案记错，拒绝自报与跨情境且重试幂等',async()=>{
 const {service}=await setup();const {token}=await service.login({code:'recall-user'});const course=courses[0];const lesson=course.content.lessons[0];const word=course.words.find(word=>lesson.paragraphs.some(p=>includesWord(p.en,word)))!;
 const input={id:randomUUID(),day:course.day,lessonId:lesson.id,type:'recall' as const,word,answerText:' '+word.toUpperCase()+' '};
 const first=await service.saveEvent(token,input);assert.equal(first.event.score,1);assert.deepEqual(first.event.answers,[1]);assert.deepEqual(await service.saveEvent(token,input),first);assert.equal((await service.events(token)).events.length,1);
 await assert.rejects(service.saveEvent(token,{...input,answerText:''}),/编号/);assert.equal((await service.saveEvent(token,{...input,id:randomUUID(),answerText:''})).event.score,0);
 await assert.rejects(async()=>service.saveEvent(token,{...input,id:randomUUID(),answers:[1]}),/自报/);await assert.rejects(async()=>service.saveEvent(token,{...input,id:randomUUID(),word:'not-a-target'}),/目标|属于/);
});

test('用户记录隔离，重复提交幂等，冲突拒绝', async () => {
  const { service, file } = await setup();
  const a = await service.login({ code: 'user-a' });
  const b = await service.login({ code: 'user-b' });
  const input = reading();
  await service.saveEvent(a.token, input);
  await service.saveEvent(a.token, input);
  assert.equal((await service.events(a.token)).events.length, 1);
  assert.equal((await service.events(b.token)).events.length, 0);
  await assert.rejects(service.saveEvent(a.token, { ...input, lessonId: courses[0].content.lessons[1].id }), /编号/);
  const stored = await readFile(file, 'utf8');
  assert.ok(!stored.includes(a.token));
  assert.ok(!stored.includes('user-a'));
});
test('课程范围、测验答案、收藏和多余字段严格检查', async () => {
  const { service } = await setup();
  const { token } = await service.login({ code: 'user-a' });
  await assert.rejects(async () => service.saveEvent(token, { ...reading(), day: 999 }), /不存在/);
  await assert.rejects(async () => service.saveEvent(token, { ...reading(), word: 'book' }), /字段/);
  await assert.rejects(async () => service.saveEvent(token, { ...reading(), type: 'quiz', answers: [0] }), /数量/);
  await assert.rejects(async () => service.saveEvent(token, { ...reading(), type: 'favorite', word: 'not-a-word', favorite: true }), /收藏/);
  await assert.rejects(async () => service.saveEvent(token, { ...reading(), user: 'someone-else' }));
  const lesson = courses[0].content.lessons[0];
  const result = await service.saveEvent(token, { ...reading(), type: 'quiz', answers: lesson.questions.map(q => q.answer) });
  assert.equal(result.event.score, lesson.questions.length);
});
test('并发写入持久保存、重启后会话与记录仍有效', async () => {
  const { service, file } = await setup();
  const { token } = await service.login({ code: 'user-a' });
  await Promise.all(Array.from({ length: 20 }, () => service.saveEvent(token, reading())));
  const reloaded = new StudyService(file, courses);
  assert.equal((await reloaded.events(token)).events.length, 20);
  await assert.rejects(reloaded.events('wrong'), /失效/);
});
test('过期会话拒绝，缺失微信密钥明确拒绝登录', async () => {
  const { service } = await setup();
  const { token } = await service.login({ code: 'user-a' });
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 8 * 86400000;
    await assert.rejects(service.events(token), /失效/);
  } finally { Date.now = originalNow; }
  await assert.rejects(wechatExchange({})('code'), /真实 WX_APP_ID/);
});
test('损坏持久文件明确失败且不覆盖', async () => {
  const { service, file } = await setup();
  await writeFile(file, '{broken-json', 'utf8');
  await assert.rejects(service.login({ code: 'user-a' }));
  assert.equal(await readFile(file, 'utf8'), '{broken-json');
});
test('HTTP公开课程、认证边界和缺失音频', async () => {
  const { service } = await setup();
  const server = createApi(service);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const directory=await fetch(`${base}/api/days`);assert.equal(directory.status,200);const catalog=await directory.json() as {days:{day:number;targetWords:string[]}[]};assert.deepEqual(catalog.days.map(day=>day.targetWords),courses.map(course=>course.words));
    assert.equal((await fetch(`${base}/api/days/1`)).status, 200);
    assert.equal((await fetch(`${base}/api/days/${courses.at(-1)!.day+1}`)).status, 404);
    assert.equal((await fetch(`${base}/api/days/${courses.at(-1)!.day}`)).status, 200);
    assert.equal((await fetch(`${base}/api/events`)).status, 401);
    assert.equal((await fetch(`${base}/audio/paragraphs/day1/none.mp3`)).status, 404);
    assert.equal((await fetch(`${base}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
    assert.equal((await fetch(`${base}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'a'.repeat(17000) }) })).status, 413);
    const response = await fetch(`${base}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'http-a' }) });
    const { token } = await response.json() as { token: string };
    assert.equal(response.status, 200);
    const sent = await fetch(`${base}/api/events`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(reading()) });
    assert.equal(sent.status, 200);
    const events = await (await fetch(`${base}/api/events`, { headers: { Authorization: `Bearer ${token}` } })).json() as { events: unknown[] };
    assert.equal(events.events.length, 1);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('随机新版拒绝旧情境提交，已保存历史仍原样读取',async()=>{
 const {service,file}=await setup();const {token}=await service.login({code:'legacy-user'});
 const state=JSON.parse(await readFile(file,'utf8'));const user=Object.values(state.sessions)[0] as {user:string};
 const old={id:randomUUID(),day:1,lessonId:'oxford-1-1',type:'quiz',answers:[0,1,2,3,0],score:3,createdAt:'2026-10-21T00:00:00.000Z'};
 state.users[user.user]=[old];await writeFile(file,JSON.stringify(state),'utf8');
 assert.deepEqual((await service.events(token)).events,[old]);
 await assert.rejects(async()=>service.saveEvent(token,{...reading(),lessonId:'oxford-1-1'}),/不存在/);
 assert.deepEqual((await service.events(token)).events,[old]);
});
