import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApi,loadCourses} from './index';
import {StudyService} from './service';
import {ProfileService} from './profile-service';
import {PersonalPlanService} from './personal-plan-service';

async function withApi(action:(context:{base:string;folder:string;audio:string;token:string;service:StudyService})=>Promise<void>){
 const folder=await mkdtemp(join(tmpdir(),'wordscape-security-'));const audio=join(folder,'audio');await mkdir(audio);
 const service=new StudyService(join(folder,'state.json'),await loadCourses(),async code=>code);const {token}=await service.login({code:'security-test-account'});
 const server=createApi(service,audio,new ProfileService(join(folder,'profiles.json')),new PersonalPlanService(join(folder,'plans.json')));await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const address=server.address();assert.ok(address&&typeof address!=='string');
 try{await action({base:`http://127.0.0.1:${address.port}`,folder,audio,token,service});}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
test('音频真实路径不得越出静态目录，目录内正常文件与链接仍可读',async()=>withApi(async({base,folder,audio})=>{
 await writeFile(join(folder,'private.txt'),'private-test-value','utf8');await symlink(join(folder,'private.txt'),join(audio,'escaped.mp3'));
 assert.equal((await fetch(`${base}/audio/escaped.mp3`)).status,404);
 await writeFile(join(audio,'normal.mp3'),'test-audio','utf8');await symlink(join(audio,'normal.mp3'),join(audio,'inside.mp3'));
 assert.equal(await(await fetch(`${base}/audio/normal.mp3`)).text(),'test-audio');assert.equal((await fetch(`${base}/audio/inside.mp3`)).status,200);
}));
test('学习记录写入必须先验证真实会话，再验证请求内容',async()=>withApi(async({base})=>{
 const response=await fetch(`${base}/api/events`,{method:'POST',headers:{Authorization:`Bearer ${'f'.repeat(64)}`,'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,401);
}));
test('服务器持久文件结构损坏返回500且不泄露内部字段或覆盖原文件',async()=>withApi(async({base,folder,token})=>{
 const headers={Authorization:`Bearer ${token}`};
 for(const [name,path] of [['profiles.json','/api/profile'],['plans.json','/api/plan'],['state.json','/api/events']]){
  const corrupt=JSON.stringify({version:999,privateMarker:'internal-only'});await writeFile(join(folder,name),corrupt,'utf8');
  const response=await fetch(base+path,{headers});assert.equal(response.status,500);const text=await response.text();assert.ok(!text.includes('privateMarker'));assert.ok(!text.includes('unrecognized_keys'));assert.equal(await readFile(join(folder,name),'utf8'),corrupt);
 }
}));
test('注销仅撤销当前会话，重复与未知凭证幂等，其他会话和学习记录保留',async()=>withApi(async({base,token,service})=>{
 const same=await service.login({code:'security-test-account'});const other=await service.login({code:'another-account'});
 const input={id:randomUUID(),day:service.courses[0].day,lessonId:service.courses[0].content.lessons[0].id,type:'read' as const};await service.saveEvent(token,input);
 const logout=(credential?:string)=>fetch(`${base}/api/session/logout`,{method:'POST',headers:credential?{Authorization:credential}:{}});
 assert.equal((await logout()).status,401);assert.equal((await logout('Bearer invalid')).status,401);
 const response=await fetch(`${base}/api/session/logout`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:'{not-json'});assert.deepEqual(await response.json(),{ok:true});await assert.rejects(service.events(token),/失效/);
 assert.deepEqual(await(await logout(`Bearer ${token}`)).json(),{ok:true});assert.deepEqual(await(await logout(`Bearer ${'f'.repeat(64)}`)).json(),{ok:true});
 assert.equal((await service.events(same.token)).events[0].id,input.id);assert.deepEqual(await service.events(other.token),{events:[]});
 const expired=await service.login({code:'expired-account'});const originalNow=Date.now;
 try{Date.now=()=>originalNow()+8*86400000;assert.deepEqual(await service.revoke(expired.token),{ok:true});}finally{Date.now=originalNow;}
}));
