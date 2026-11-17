import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionController,type SessionDependencies} from '../src/shared/session-controller';
import type {StudyEvent} from '../src/shared/study-types';
import type {DailyBatch} from '../src/shared/daily-types';
const lesson={id:'oxford-1-1',questions:[]} as unknown as DailyBatch['content']['lessons'][number];
const entry=(id:string):StudyEvent=>({id,day:1,lessonId:lesson.id,type:'read',createdAt:'2026-10-21T00:00:00.000Z'});
function setup(){
 let stored:unknown='';let active='';let now=Date.parse('2026-10-21T00:00:00.000Z');let next='a';let failed=false;let unavailable=false;let rejected=false;let saves=0;
 const profile=async(token:string)=>({profile:{userId:`WS-${token.slice(0,16).toUpperCase()}`,nickName:token.slice(0,1),hasAvatar:false,avatarVersion:null},avatarPath:''});
 const deps:SessionDependencies={revoke:async()=>{},loadPlan:async()=>null,updatePlan:async(_mode,input)=>({...input,version:'personal-v1'}),createPlan:async(_mode,input)=>({...input,startedOn:'2026-10-21',version:'personal-v1'}),loadProfile:profile,updateProfile:profile,uploadAvatar:profile,read:()=>stored,write:value=>{stored=structuredClone(value);},activate:value=>{active=value;},newId:()=>`identity-${next}`,now:()=>now,
  login:async()=>({token:next.repeat(64),expiresAt:new Date(now+86400000).toISOString()}),
  days:async()=>[{day:1,date:'2026-10-14',words:30},{day:2,date:'2026-10-15',words:30}],
  events:async(mode,token)=>{if(unavailable)throw Error('网络失败');if(mode==='wechat'&&failed)throw Error('候选账号请求失败');if(mode==='wechat'&&rejected)throw new Expired();return [entry(mode==='local'?'guest':token!.slice(0,1))];},
  save:async(mode,input,_lesson,known,token)=>{saves++;if(mode==='wechat'&&rejected)throw new Expired();return [...known,entry(input.id+(mode==='wechat'?token!.slice(0,1):''))];},isExpired:error=>error instanceof Expired,
 };
 class Expired extends Error{}
 return {deps,create:()=>createSessionController(deps),stored:()=>stored,active:()=>active,setNext:(value:string)=>{next=value;},fail:()=>{failed=true;},offline:()=>{unavailable=true;},online:()=>{unavailable=false;},expire:()=>{now+=2*86400000;},reject:()=>{rejected=true;},saves:()=>saves,setStored:(value:unknown)=>{stored=value;}};
}
test('跨页面订阅即时同步保存，游客记录不自动上传，注销恢复原游客记录',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();let updates=0;const unsubscribe=session.subscribe(()=>{updates++;});
 assert.equal(session.getSnapshot().events[0].id,'guest');await session.login();assert.deepEqual(session.getSnapshot().events.map(e=>e.id),['a']);assert.equal(fixture.saves(),0);
 await session.record({id:'saved',day:1,lessonId:lesson.id,type:'read'},lesson);assert.equal(session.getSnapshot().events.at(-1)?.id,'saveda');assert.ok(updates>0);unsubscribe();
 await session.logout();assert.equal(session.getSnapshot().mode,'local');assert.equal(session.getSnapshot().events[0].id,'guest');assert.equal(fixture.active(),'');
});
test('切换账号失败时旧账号、token及事件原子保持，成功后整体替换',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();await session.login();const identity=session.getSnapshot().identityKey;
 fixture.setNext('b');fixture.fail();await assert.rejects(session.login(),/候选账号/);assert.equal(fixture.active(),'a'.repeat(64));assert.equal(session.getSnapshot().identityKey,identity);assert.equal(session.getSnapshot().events[0].id,'a');
 const success=setup();const switched=success.create();await switched.initialize();await switched.login();success.setNext('b');await switched.login();assert.equal(switched.getSnapshot().identityKey,'identity-b');assert.equal(switched.getSnapshot().events[0].id,'b');
});
test('候选会话写入失败时旧账号与记录保持不变',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();await session.login();const original=fixture.stored();fixture.setNext('b');fixture.deps.write=()=>{throw Error('存储写入失败');};
 await assert.rejects(session.login(),/存储写入失败/);assert.equal(fixture.active(),'a'.repeat(64));assert.equal(session.getSnapshot().events[0].id,'a');assert.deepEqual(fixture.stored(),original);
});
test('重启恢复有效会话、账号进度与选择的学习日',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();await session.login();await session.selectDay(2);
 const resumed=fixture.create();await resumed.initialize();assert.equal(resumed.getSnapshot().mode,'wechat');assert.equal(resumed.getSnapshot().selectedDay,2);assert.equal(resumed.getSnapshot().events[0].id,'a');assert.equal(resumed.getSnapshot().identityKey,session.getSnapshot().identityKey);
});
test('过期恢复及服务端拒绝均阻止保存，不切换游客模式',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();await session.login();fixture.expire();const resumed=fixture.create();await assert.rejects(resumed.initialize(),/过期/);assert.equal(resumed.getSnapshot().mode,'wechat');assert.equal(resumed.getSnapshot().ready,false);
 await assert.rejects(resumed.record({id:'blocked',day:1,lessonId:lesson.id,type:'read'},lesson),/过期/);assert.equal(fixture.saves(),0);
 const second=setup();const active=second.create();await active.initialize();await active.login();second.reject();await assert.rejects(active.refresh());await assert.rejects(active.record({id:'blocked',day:1,lessonId:lesson.id,type:'read'},lesson),/过期/);assert.equal(second.saves(),0);
});
test('网络恢复失败与损坏存储不降级、不覆盖原持久记录',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();await session.login();const before=fixture.stored();fixture.offline();const resumed=fixture.create();await assert.rejects(resumed.initialize(),/网络/);assert.equal(resumed.getSnapshot().mode,'wechat');assert.deepEqual(fixture.stored(),before);
 const broken=setup();broken.setStored({broken:true});const invalid=broken.create();await assert.rejects(invalid.initialize());await assert.rejects(invalid.refresh(),/无法恢复/);assert.deepEqual(broken.stored(),{broken:true});
});
test('恢复失败不标记就绪，显式刷新可恢复原账号',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();await session.login();fixture.offline();const resumed=fixture.create();await assert.rejects(resumed.initialize());assert.equal(resumed.getSnapshot().ready,false);fixture.online();await resumed.refresh();assert.equal(resumed.getSnapshot().ready,true);assert.equal(resumed.getSnapshot().events[0].id,'a');assert.equal(resumed.getSnapshot().mode,'wechat');
});
test('已选课程缺失时明确报错，不自动改成第一天',async()=>{
 const fixture=setup();fixture.setStored({version:1,mode:'local',selectedDay:3});const session=fixture.create();await assert.rejects(session.initialize(),/第3天/);assert.equal(session.getSnapshot().selectedDay,3);assert.equal(session.getSnapshot().ready,false);assert.deepEqual(fixture.stored(),{version:1,mode:'local',selectedDay:3});
});
test('退出先清除账号，即使本机记录损坏也保持退出并明确报错',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();await session.login();
 const originalEvents=fixture.deps.events;fixture.deps.events=async(mode,token)=>{if(mode==='local')throw Error('本机记录损坏');return originalEvents(mode,token);};
 await assert.rejects(session.logout(),/本机记录损坏/);assert.equal(fixture.active(),'');assert.equal(session.getSnapshot().mode,'local');assert.equal(session.getSnapshot().ready,false);assert.deepEqual(session.getSnapshot().events,[]);assert.equal(session.getSnapshot().identityKey,'local');assert.deepEqual(fixture.stored(),{version:1,mode:'local',selectedDay:1});
});
test('退出云端独有学习日重置本机第一天，服务端撤销后本机保存失败阻止继续使用',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();
 const originalDays=fixture.deps.days;fixture.deps.days=async mode=>mode==='wechat'?[...(await originalDays(mode)),{day:3,date:'2026-10-16',words:30}]:originalDays(mode);
 await session.login();await session.selectDay(3);await session.logout();assert.equal(session.getSnapshot().selectedDay,1);assert.equal(session.getSnapshot().ready,true);assert.equal(fixture.active(),'');
 await session.login();fixture.deps.write=()=>{throw Error('存储写入失败');};await assert.rejects(session.logout(),/本机状态保存失败/);assert.equal(session.getSnapshot().ready,false);assert.equal(fixture.active(),'');assert.deepEqual(session.getSnapshot().events,[]);
});
test('资料跟随账号原子切换，失败保留旧资料，退出清除头像昵称',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();assert.equal(session.getSnapshot().account,null);await session.login();assert.equal(session.getSnapshot().account?.profile.nickName,'a');
 fixture.setNext('b');fixture.deps.loadProfile=async()=>{throw Error('头像读取失败');};await assert.rejects(session.login(),/头像/);assert.equal(session.getSnapshot().account?.profile.nickName,'a');assert.equal(fixture.active(),'a'.repeat(64));
 await session.logout();assert.equal(session.getSnapshot().account,null);
});
test('资料刷新和修改保留学习记录，过期后拒绝修改',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();await assert.rejects(session.updateProfile('昵称'),/登录/);await session.login();
 fixture.deps.updateProfile=async(token,nickName)=>({profile:{userId:`WS-${token.slice(0,16).toUpperCase()}`,nickName,hasAvatar:false,avatarVersion:null},avatarPath:''});
 await session.updateProfile('新昵称');assert.equal(session.getSnapshot().account?.profile.nickName,'新昵称');assert.equal(session.getSnapshot().events[0].id,'a');
 await session.refresh();assert.equal(session.getSnapshot().account?.profile.nickName,'a');fixture.expire();await assert.rejects(session.uploadAvatar('/tmp/avatar'),/过期/);
});
test('每日计划保存后即时跨页共享，重新读取恢复，本机与账号计划独立',async()=>{
 const fixture=setup();const localPlan={id:'df50299f-4802-47cf-ae1a-60fc3a095bee',wordsPerDay:10,startedOn:'2026-10-21',version:'personal-v1' as const};
 let cloudPlan:typeof localPlan|null=null;
 fixture.deps.loadPlan=async mode=>mode==='local'?localPlan:cloudPlan;
 fixture.deps.createPlan=async(_mode,input)=>{cloudPlan={...localPlan,...input};return cloudPlan;};
 fixture.deps.newId=()=> '9856ad24-d1ec-4a7c-863d-f3c0d518b38f';
 const session=fixture.create();await session.initialize();assert.equal(session.getSnapshot().plan?.wordsPerDay,10);await session.login();assert.equal(session.getSnapshot().plan,null);
 await session.startPlan(80);assert.equal(session.getSnapshot().plan?.wordsPerDay,80);assert.equal(session.getSnapshot().events[0].id,'a');
 const resumed=fixture.create();await resumed.initialize();assert.equal(resumed.getSnapshot().plan?.wordsPerDay,80);await session.logout();assert.equal(session.getSnapshot().plan?.wordsPerDay,10);
});
test('计划创建的网络重试复用编号，失败不伪报成功，已开始或无效词数不可覆盖',async()=>{
 const fixture=setup();fixture.deps.newId=()=> '9856ad24-d1ec-4a7c-863d-f3c0d518b38f';const session=fixture.create();await session.initialize();
 const attempts:string[]=[];fixture.deps.createPlan=async(_mode,input)=>{attempts.push(input.id);if(attempts.length===1)throw Error('网络中断');return {...input,startedOn:'2026-10-21',version:'personal-v1'};};
 await assert.rejects(session.startPlan(9),/10至80/);assert.equal(attempts.length,0);
 await assert.rejects(session.startPlan(10),/网络中断/);assert.equal(session.getSnapshot().plan,null);await session.startPlan(10);assert.equal(attempts[0],attempts[1]);await assert.rejects(session.startPlan(80),/已开始/);assert.equal(session.getSnapshot().plan?.wordsPerDay,10);
});
test('候选账号计划读取失败时不切换账号，也不混入其计划',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();await session.login();const before=session.getSnapshot();fixture.setNext('b');fixture.deps.loadPlan=async()=>{throw Error('计划读取失败');};
 await assert.rejects(session.login(),/计划读取失败/);assert.equal(fixture.active(),'a'.repeat(64));assert.equal(session.getSnapshot().identityKey,before.identityKey);assert.equal(session.getSnapshot().plan,before.plan);
});
test('修改计划失败不改变原安排；创建保留选择的开始日期',async()=>{
 const fixture=setup();const plan={id:'9856ad24-d1ec-4a7c-863d-f3c0d518b38f',wordsPerDay:30,startedOn:'2026-10-21',version:'personal-v1' as const};fixture.deps.loadPlan=async()=>plan;
 const session=fixture.create();await session.initialize();fixture.deps.updatePlan=async()=>{throw Error('网络失败');};await assert.rejects(session.changePlan(15,'2026-10-15'),/网络/);assert.deepEqual(session.getSnapshot().plan,plan);
 const fresh=setup();fresh.deps.newId=()=>plan.id;let date='';fresh.deps.createPlan=async(_mode,input)=>{date=input.startedOn!;return {...plan,...input};};const created=fresh.create();await created.initialize();await created.startPlan(15,'2026-10-15');assert.equal(date,'2026-10-15');
});
test('十天计划只有两天真实课程，未生成日期可选可重启恢复且不能保存假课程',async()=>{
 const fixture=setup();let plan={id:'9856ad24-d1ec-4a7c-863d-f3c0d518b38f',wordsPerDay:30,startedOn:'2026-10-12',version:'personal-v1' as const};fixture.deps.loadPlan=async()=>plan;let now=Date.parse('2026-10-21T00:00:00Z');fixture.deps.now=()=>now;
 const session=fixture.create();await session.initialize();assert.equal(session.getSnapshot().days.length,2);assert.equal(session.getSnapshot().calendarDays.length,10);const events=session.getSnapshot().events;
 await session.selectDay(10);assert.equal(session.getSnapshot().selectedDay,10);await assert.rejects(session.record({id:'not-real',day:10,lessonId:lesson.id,type:'read'},lesson),/不一致/);assert.equal(fixture.saves(),0);assert.equal(session.getSnapshot().events,events);
 const resumed=fixture.create();await resumed.initialize();assert.equal(resumed.getSnapshot().selectedDay,10);now+=86400000;resumed.refreshCalendar();assert.equal(resumed.getSnapshot().calendarDays.length,11);assert.equal(resumed.getSnapshot().selectedDay,10);
 plan={...plan,wordsPerDay:40};await resumed.refresh();assert.equal(resumed.getSnapshot().selectedDay,1);assert.equal(resumed.getSnapshot().events[0].id,'guest');
});
test('跨账号计划日历独立，首次计划和计划修改从第一天开始且进度保留',async()=>{
 const fixture=setup();const aPlan={id:'9856ad24-d1ec-4a7c-863d-f3c0d518b38f',wordsPerDay:30,startedOn:'2026-10-12',version:'personal-v1' as const};const bPlan={...aPlan,id:'df50299f-4802-47cf-ae1a-60fc3a095bee',startedOn:'2026-10-20'};
 fixture.deps.loadPlan=async(mode,token)=>mode==='local'?null:token?.startsWith('a')?aPlan:bPlan;
 const session=fixture.create();await session.initialize();await session.selectDay(2);await session.login();assert.equal(session.getSnapshot().selectedDay,1);await session.selectDay(10);fixture.setNext('b');await session.login();assert.equal(session.getSnapshot().selectedDay,1);assert.equal(session.getSnapshot().calendarDays.length,2);assert.equal(session.getSnapshot().events[0].id,'b');
 await session.selectDay(2);await session.changePlan(40,'2026-10-15');assert.equal(session.getSnapshot().selectedDay,1);assert.equal(session.getSnapshot().calendarDays.length,7);assert.equal(session.getSnapshot().events[0].id,'b');
 await session.logout();assert.equal(session.getSnapshot().calendarDays.length,2);assert.equal(session.getSnapshot().events[0].id,'guest');
});
test('个人第10天切换到无计划账号时从原第1天开始，不阻塞登录',async()=>{
 const fixture=setup();const now=Date.parse('2026-10-22T00:00:00Z');fixture.deps.now=()=>now;let candidate='a';fixture.deps.login=async()=>({token:candidate.repeat(64),expiresAt:new Date(now+86400000).toISOString()});const plan={id:'9856ad24-d1ec-4a7c-863d-f3c0d518b38f',wordsPerDay:30,startedOn:'2026-10-13',version:'personal-v1' as const};fixture.deps.loadPlan=async(mode,token)=>mode==='wechat'&&token?.startsWith('a')?plan:null;
 const session=fixture.create();await session.initialize();await session.login();await session.selectDay(10);fixture.setNext('b');candidate='b';await session.login();assert.equal(session.getSnapshot().selectedDay,1);assert.equal(session.getSnapshot().plan,null);assert.equal(session.getSnapshot().calendarDays.length,2);assert.equal(session.getSnapshot().events[0].id,'b');
});
test('退出先撤销服务器凭证；网络失败保留登录并明确失败',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();await session.login();let revoked='';fixture.deps.revoke=async token=>{revoked=token;throw Error('网络不可用');};
 await assert.rejects(session.logout(),/网络不可用/);assert.equal(revoked,'a'.repeat(64));assert.equal(session.getSnapshot().mode,'wechat');assert.equal(fixture.active(),'a'.repeat(64));assert.equal(session.getSnapshot().events[0].id,'a');
 fixture.deps.revoke=async token=>{revoked=token;};await session.logout();assert.equal(session.getSnapshot().mode,'local');assert.equal(fixture.active(),'');
});
test('登录过程中重复初始化不会制造正在处理错误',async()=>{
 const fixture=setup();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const login=fixture.deps.login;fixture.deps.login=async()=>{await gate;return login();};const session=fixture.create();
 const pending=session.login();await session.initialize();assert.equal(session.getSnapshot().error,'');assert.equal(session.getSnapshot().busy,true);release();await pending;assert.equal(session.getSnapshot().ready,true);assert.equal(session.getSnapshot().error,'');
});
test('保存超时后重试相同操作复用记录编号，避免重复历史',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();const ids:string[]=[];fixture.deps.save=async(_mode,input,_lesson,known)=>{ids.push(input.id);if(ids.length===1)throw Error('响应超时');return [...known,entry(input.id)];};
 await assert.rejects(session.record({id:'first',day:1,lessonId:lesson.id,type:'read'},lesson),/超时/);await session.record({id:'retry',day:1,lessonId:lesson.id,type:'read'},lesson);assert.deepEqual(ids,['first','first']);
 await session.record({id:'next',day:1,lessonId:lesson.id,type:'read'},lesson);assert.equal(ids.at(-1),'next');
});
test('本机三天试学不受旧本机计划限制，微信计划仍严格匹配课程',async()=>{
 const fixture=setup();fixture.deps.loadPlan=async()=>({id:'9856ad24-d1ec-4a7c-863d-f3c0d518b38f',wordsPerDay:15,startedOn:'2026-10-21',version:'personal-v1'});const session=fixture.create();await session.initialize();await assert.rejects(session.selectDay(2));
 await session.openReview(2);assert.equal(session.getSnapshot().selectedDay,2);assert.equal(session.getSnapshot().reviewingCourse,true);const resumed=fixture.create();await resumed.initialize();assert.equal(resumed.getSnapshot().reviewingCourse,true);assert.equal(resumed.getSnapshot().selectedDay,2);
 await session.selectDay(1);assert.equal(session.getSnapshot().reviewingCourse,false);await session.record({id:'trial',day:1,lessonId:lesson.id,type:'read'},lesson);assert.equal(fixture.saves(),1);
 await session.login();await assert.rejects(session.record({id:'mismatch',day:1,lessonId:lesson.id,type:'read'},lesson),/计划词表不一致/);assert.equal(fixture.saves(),1);
});
test('刷新外部修改的计划同时退出旧课复习，不能绕过课程匹配',async()=>{
 const fixture=setup();let plan={id:'9856ad24-d1ec-4a7c-863d-f3c0d518b38f',wordsPerDay:15,startedOn:'2026-10-21',version:'personal-v1' as const};fixture.deps.loadPlan=async()=>plan;const session=fixture.create();await session.initialize();await session.openReview(2);assert.equal(session.getSnapshot().reviewingCourse,true);
 plan={...plan,wordsPerDay:30};await session.refresh();assert.equal(session.getSnapshot().reviewingCourse,false);assert.equal(session.getSnapshot().selectedDay,1);
});
test('新答案成功后清除同情境旧重试，改回旧答案应创建新记录',async()=>{
 const fixture=setup();const session=fixture.create();await session.initialize();const ids:string[]=[];fixture.deps.save=async(_mode,input,_lesson,known)=>{ids.push(input.id);if(ids.length===1)throw Error('响应超时');return [...known,entry(input.id)];};
 await assert.rejects(session.record({id:'answer-a',day:1,lessonId:lesson.id,type:'quiz',answers:[0]},lesson));
 await session.record({id:'answer-b',day:1,lessonId:lesson.id,type:'quiz',answers:[1]},lesson);
 await session.record({id:'answer-a-again',day:1,lessonId:lesson.id,type:'quiz',answers:[0]},lesson);assert.deepEqual(ids,['answer-a','answer-b','answer-a-again']);
});

test('旧词序计划切换随机版本后回到第1天，计划与历史不改写',async()=>{
 const fixture=setup();const plan={id:'9856ad24-d1ec-4a7c-863d-f3c0d518b38f',wordsPerDay:30,startedOn:'2026-10-20',version:'personal-v1' as const};
 fixture.deps.loadPlan=async()=>plan;
 fixture.setStored({version:1,mode:'local',selectedDay:2,calendarPlanKey:JSON.stringify([plan.id,plan.startedOn,plan.wordsPerDay])});
 const session=fixture.create();await session.initialize();assert.equal(session.getSnapshot().selectedDay,1);assert.deepEqual(session.getSnapshot().plan,plan);assert.equal(session.getSnapshot().events[0].id,'guest');assert.equal(fixture.saves(),0);
});
