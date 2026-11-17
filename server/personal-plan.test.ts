import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {StudyService} from './service';
import {ProfileService} from './profile-service';
import {PersonalPlanService} from './personal-plan-service';
import {createApi,loadCourses} from './index';
import {today} from '../src/shared/daily-plan';

test('个人计划HTTP认证、10与80边界、账号隔离、幂等及旧记录保留',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'wordscape-plan-http-'));const stateFile=join(folder,'state.json');const profileFile=join(folder,'profiles.json');const planFile=join(folder,'plans.json');const courses=await loadCourses();
 const study=new StudyService(stateFile,courses,async code=>code);const a=await study.login({code:'plan-user-a'});const b=await study.login({code:'plan-user-b'});const profiles=new ProfileService(profileFile);await profiles.patch(await study.account(a.token),{nickName:'原资料'});
 await study.saveEvent(a.token,{id:randomUUID(),day:1,lessonId:courses[0].content.lessons[0].id,type:'read'});const originalState=await readFile(stateFile,'utf8');const originalProfiles=await readFile(profileFile,'utf8');
 const server=createApi(study,join(folder,'audio'),profiles,new PersonalPlanService(planFile));await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
 const request=(token:string,method='GET',body?:unknown,path='/api/plan')=>fetch(`${base}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  assert.equal((await request('')).status,401);assert.equal((await request('','POST',{id:randomUUID(),wordsPerDay:30})).status,401);assert.equal((await request('f'.repeat(64))).status,401);assert.equal(await(await request(a.token)).json(),null);
  for(const wordsPerDay of [9,81,10.5,'30',null])assert.equal((await request(a.token,'POST',{id:randomUUID(),wordsPerDay})).status,400);
  assert.equal((await request(a.token,'POST',{id:randomUUID(),wordsPerDay:10,startedOn:'2099-01-01'})).status,400);
  const input={id:randomUUID(),wordsPerDay:10};const createdResponse=await request(a.token,'POST',input);assert.equal(createdResponse.status,200);const created=await createdResponse.json();assert.deepEqual(created,{...input,startedOn:today(),version:'personal-v1'});
  assert.deepEqual(await(await request(a.token,'POST',input)).json(),created);assert.equal((await request(a.token,'POST',{...input,wordsPerDay:11})).status,409);assert.equal((await request(a.token,'POST',{id:randomUUID(),wordsPerDay:10})).status,409);
  assert.equal(await(await request(b.token)).json(),null);const other={id:randomUUID(),wordsPerDay:80};assert.equal((await request(b.token,'POST',other)).status,200);assert.deepEqual(await(await request(a.token)).json(),created);
  const reloaded=new PersonalPlanService(planFile);assert.deepEqual(await reloaded.get(await study.account(a.token)),created);assert.equal((await reloaded.get(await study.account(b.token)))?.wordsPerDay,80);
  assert.equal(await readFile(stateFile,'utf8'),originalState);assert.equal(await readFile(profileFile,'utf8'),originalProfiles);
  assert.equal((await request('','POST',{...input,startedOn:'2026-10-15'},'/api/plan/update')).status,401);
  assert.equal((await request(a.token,'POST',{...input,startedOn:'2099-01-01'},'/api/plan/update')).status,400);
  assert.equal((await request(a.token,'POST',{...input,id:randomUUID(),startedOn:'2026-10-15'},'/api/plan/update')).status,409);
  const updated=await request(a.token,'POST',{...input,wordsPerDay:40,startedOn:'2026-10-15'},'/api/plan/update');assert.equal(updated.status,200);assert.deepEqual(await updated.json(),{...input,wordsPerDay:40,startedOn:'2026-10-15',version:'personal-v1'});
  assert.equal(await readFile(stateFile,'utf8'),originalState);assert.equal(await readFile(profileFile,'utf8'),originalProfiles);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
test('自选过去日期创建与修改严格校验，同id不同日期拒绝且未知计划不能更新',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'wordscape-plan-dates-'));const plans=new PersonalPlanService(join(folder,'plans.json'));const account='a'.repeat(64);const input={id:randomUUID(),wordsPerDay:30,startedOn:'2026-10-15'};
 assert.deepEqual(await plans.create(account,input),{...input,version:'personal-v1'});await assert.rejects(plans.create(account,{...input,startedOn:'2026-10-16'}),/日期/);
 await assert.rejects(plans.update('b'.repeat(64),input),/不存在/);await assert.rejects(async()=>plans.update(account,{...input,startedOn:'2026-02-30'}));await assert.rejects(async()=>plans.update(account,{...input,startedOn:'2099-01-01'}),/今天/);
 assert.deepEqual(await plans.update(account,{...input,wordsPerDay:80}),{...input,wordsPerDay:80,version:'personal-v1'});
});

test('个人计划并发创建不覆盖、同请求幂等、损坏数据拒绝覆盖',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'wordscape-plan-persistence-'));const file=join(folder,'plans.json');const plans=new PersonalPlanService(file);const account='a'.repeat(64);const input={id:randomUUID(),wordsPerDay:30};
 const results=await Promise.all(Array.from({length:10},()=>plans.create(account,input)));assert.ok(results.every(plan=>JSON.stringify(plan)===JSON.stringify(results[0])));
 const concurrent=await Promise.allSettled([plans.create('b'.repeat(64),{id:randomUUID(),wordsPerDay:20}),plans.create('b'.repeat(64),{id:randomUUID(),wordsPerDay:40})]);assert.equal(concurrent.filter(value=>value.status==='fulfilled').length,1);assert.equal(concurrent.filter(value=>value.status==='rejected').length,1);
 const original=await readFile(file,'utf8');await assert.rejects(plans.create(account,{...input,wordsPerDay:40}),/编号/);assert.equal(await readFile(file,'utf8'),original);
 await writeFile(file,'{broken','utf8');await assert.rejects(plans.create('c'.repeat(64),{id:randomUUID(),wordsPerDay:30}));assert.equal(await readFile(file,'utf8'),'{broken');
 await writeFile(file,JSON.stringify({version:1,users:{[account]:{...input,startedOn:'2026-02-30',version:'personal-v1'}}}),'utf8');await assert.rejects(plans.get(account));
});
