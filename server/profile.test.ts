import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {StudyService} from './service';
import {ProfileService} from './profile-service';
import {createApi,loadCourses} from './index';

test('资料与私有头像HTTP鉴权、两用户隔离、跨会话保留且不改学习记录',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'wordscape-profile-'));const stateFile=join(folder,'state.json');const profileFile=join(folder,'profiles.json');const courses=await loadCourses();
 const study=new StudyService(stateFile,courses,async code=>code);const a=await study.login({code:'account-a'});const b=await study.login({code:'account-b'});
 await study.saveEvent(a.token,{id:randomUUID(),day:1,lessonId:courses[0].content.lessons[0].id,type:'read'});const originalState=await readFile(stateFile,'utf8');
 const server=createApi(study,join(folder,'audio'),new ProfileService(profileFile));await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
 const request=(path:string,token:string,method='GET',body?:unknown)=>fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  assert.equal((await request('/api/profile','')).status,401);assert.equal((await request('/api/profile/avatar','')).status,401);
  assert.equal((await request('/api/profile/avatar','','PUT',{base64:'invalid'})).status,401);assert.equal((await request('/api/profile','f'.repeat(64))).status,401);
  const initialA=await(await request('/api/profile',a.token)).json() as {userId:string;nickName:string;hasAvatar:boolean;avatarVersion:null};assert.match(initialA.userId,/^WS-[A-F0-9]{16}$/);assert.deepEqual({...initialA,userId:undefined},{userId:undefined,nickName:'',hasAvatar:false,avatarVersion:null});assert.equal((await request('/api/profile/avatar',a.token)).status,404);
  assert.equal((await request('/api/profile',a.token,'POST',{nickName:'小糖'})).status,200);assert.equal((await request('/api/profile',a.token,'POST',{nickName:''})).status,400);assert.equal((await request('/api/profile',a.token,'POST',{nickName:'x',userId:'b'})).status,400);
  assert.equal((await request('/api/profile/avatar',a.token,'PUT',{base64:'not-base64'})).status,400);
  assert.equal((await request('/api/profile/avatar',a.token,'PUT',{base64:Buffer.from('not an image').toString('base64')})).status,415);
  assert.equal((await request('/api/profile/avatar',a.token,'PUT',{base64:Buffer.from([137,80,78,71,13,10,26,10,1]).toString('base64')})).status,422);
  assert.equal((await request('/api/profile/avatar',a.token,'PUT',{base64:Buffer.alloc(512*1024+1).toString('base64')})).status,413);
  assert.equal((await request('/api/profile/avatar',a.token,'PUT',{base64:'A'.repeat(720*1024)})).status,413);
  const input=await sharp({create:{width:40,height:30,channels:4,background:'#123456'}}).png().toBuffer();const uploaded=await request('/api/profile/avatar',a.token,'PUT',{base64:input.toString('base64')});assert.equal(uploaded.status,200);const profile=await uploaded.json() as {hasAvatar:boolean;avatarVersion:string};assert.equal(profile.hasAvatar,true);assert.match(profile.avatarVersion,/^[a-f0-9]{64}$/);
  const image=await request('/api/profile/avatar',a.token);assert.equal(image.headers.get('Content-Type'),'image/png');assert.equal(image.headers.get('Cache-Control'),'private, no-store');const metadata=await sharp(Buffer.from(await image.arrayBuffer())).metadata();assert.equal(metadata.width,256);assert.equal(metadata.height,256);
  const initialB=await(await request('/api/profile',b.token)).json() as {userId:string;nickName:string;hasAvatar:boolean;avatarVersion:null};assert.match(initialB.userId,/^WS-[A-F0-9]{16}$/);assert.notEqual(initialB.userId,initialA.userId);assert.equal(initialB.nickName,'');assert.equal(initialB.hasAvatar,false);assert.equal(initialB.avatarVersion,null);assert.equal((await request('/api/profile/avatar',b.token)).status,404);assert.equal((await request(`/api/profile/avatar?token=${a.token}`,b.token)).status,404);assert.equal((await request(`/api/profile/avatar?token=${a.token}`,'')).status,401);
  assert.equal(await readFile(stateFile,'utf8'),originalState);
  const aAgain=await study.login({code:'account-a'});const restored=await(await request('/api/profile',aAgain.token)).json() as {nickName:string;avatarVersion:string};assert.equal(restored.nickName,'小糖');assert.equal(restored.avatarVersion,profile.avatarVersion);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

test('头像拒绝伪造、损坏、超大及超像素图片，原资料不变；并发资料不会相互覆盖',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'wordscape-profile-images-'));const file=join(folder,'profiles.json');const profiles=new ProfileService(file);const account='a'.repeat(64);await profiles.patch(account,{nickName:'原昵称'});const before=await readFile(file,'utf8');
 await assert.rejects(profiles.putAvatar(account,{base64:'not-base64'}));await assert.rejects(profiles.putAvatar(account,{base64:Buffer.from('hello').toString('base64')}),/JPEG或PNG/);
 await assert.rejects(profiles.putAvatar(account,{base64:Buffer.from([137,80,78,71,13,10,26,10,1,2,3]).toString('base64')}),/损坏/);
 await assert.rejects(profiles.putAvatar(account,{base64:Buffer.alloc(512*1024+1).toString('base64')}),/512KiB/);
 const oversized=await sharp({create:{width:4097,height:2,channels:3,background:'red'}}).png().toBuffer();await assert.rejects(profiles.putAvatar(account,{base64:oversized.toString('base64')}),/4096/);assert.equal(await readFile(file,'utf8'),before);
 const jpeg=await sharp({create:{width:10,height:10,channels:3,background:'blue'}}).jpeg().toBuffer();await Promise.all([profiles.putAvatar(account,{base64:jpeg.toString('base64')}),profiles.patch(account,{nickName:'新昵称'}),profiles.patch('b'.repeat(64),{nickName:'另一用户'})]);assert.equal((await profiles.get(account)).nickName,'新昵称');assert.equal((await profiles.get(account)).hasAvatar,true);assert.equal((await profiles.get('b'.repeat(64))).nickName,'另一用户');
 const stored=await readFile(file,'utf8');assert.ok(!stored.includes('base64'));assert.ok(!stored.includes('token'));
 await writeFile(file,'{broken','utf8');await assert.rejects(profiles.patch(account,{nickName:'不能覆盖'}));assert.equal(await readFile(file,'utf8'),'{broken');
});
