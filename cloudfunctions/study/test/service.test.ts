import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createStudyService} from '../main/service';
import {collections,type Repository,type Transaction,type Collection,type Document,type Storage} from '../main/repository';
import {courseCatalog} from '../../../src/shared/course-catalog';
import type {StudyEvent} from '../../../src/shared/study-types';
import {today} from '../../../src/shared/daily-plan';
import {includesWord} from '../../../src/shared/lexical';

// 仅测试内的内存事务端口；生产入口始终绑定微信SDK，不开放测试登录。
class MemoryRepository implements Repository{
 rows=new Map<string,Document>();private pending:Promise<unknown>=Promise.resolve();
 transaction<T>(action:(tx:Transaction)=>Promise<T>):Promise<T>{
  const run=this.pending.then(async()=>{const rows=structuredClone(this.rows);const result=await action({get:async(c,id)=>rows.get(c+':'+id)??null,set:async(c,id,value)=>{rows.set(c+':'+id,structuredClone(value));},remove:async(c,id)=>{rows.delete(c+':'+id);}});this.rows=rows;return result;});this.pending=run.then(()=>undefined,()=>undefined);return run;
 }
 async eventPage(owner:string,after:number,limit:number){return [...this.rows.entries()].filter(([key,row])=>key.startsWith(collections.events+':')&&row.owner===owner&&Number(row.sequence)>after).map(([,row])=>row).sort((a,b)=>Number(a.sequence)-Number(b.sequence)).slice(0,limit);}
 put(collection:Collection,id:string,value:Document){this.rows.set(collection+':'+id,value);}
}
function setup(){
 const repository=new MemoryRepository();const uploads=new Map<string,Buffer>();const downloaded:string[]=[];let now=Date.now();
 const storage:Storage={upload:async(path,bytes)=>{const id='cloud://test/'+path;uploads.set(id,bytes);return id;},download:async id=>{downloaded.push(id);const bytes=uploads.get(id);if(!bytes)throw Error('测试头像缺失');return bytes;}};
 const service=createStudyService(repository,storage,{audioStorageRoot:'cloud://test.bucket',now:()=>now});
 const call=(path:string,method='GET',data?:unknown,token?:string,openid='user-a')=>service.handle({path,method,...(data===undefined?{}:{data}),...(token?{token}:{})},openid);
 const login=async(openid='user-a')=>{const response=await call('/api/session','POST',{},undefined,openid);assert.equal(response.statusCode,200);return (response.data as {token:string}).token;};
 return {repository,uploads,downloaded,service,call,login,expire:()=>{now+=8*86400000;}};
}
const lesson=courseCatalog[0].content.lessons[0];
test('云回忆记录文本判分、目标词验证、幂等与账号隔离',async()=>{
 const f=setup();const token=await f.login();const course=courseCatalog[0];const word=course.words.find(word=>lesson.paragraphs.some(p=>includesWord(p.en,word)))!;
 const input={id:randomUUID(),day:course.day,lessonId:lesson.id,type:'recall',word,answerText:' '+word.toUpperCase()+' '};
 const response=await f.call('/api/events','POST',input,token);assert.equal(response.statusCode,200);assert.deepEqual((response.data as {event:StudyEvent}).event.answers,[1]);assert.equal((response.data as {event:StudyEvent}).event.score,1);
 assert.deepEqual(await f.call('/api/events','POST',input,token),response);assert.equal((await f.call('/api/events','POST',{...input,answerText:''},token)).statusCode,409);
 const wrong=await f.call('/api/events','POST',{...input,id:randomUUID(),answerText:''},token);assert.deepEqual((wrong.data as {event:StudyEvent}).event.answers,[0]);
 assert.equal((await f.call('/api/events','POST',{...input,id:randomUUID(),answers:[1]},token)).statusCode,400);assert.equal((await f.call('/api/events','POST',{...input,id:randomUUID(),score:1},token)).statusCode,400);assert.equal((await f.call('/api/events','POST',{...input,id:randomUUID(),word:'not-a-target'},token)).statusCode,400);
 const b=await f.login('user-b');assert.deepEqual((await f.call('/api/events','GET',{},b,'user-b')).data,{events:[],nextCursor:null});
});
const reading=()=>({id:randomUUID(),day:courseCatalog[0].day,lessonId:lesson.id,type:'read' as const});
const owner=(id:string)=>createHash('sha256').update(id).digest('hex');
test('身份只来自微信上下文，跨用户会话不可用；注销幂等且不影响其他会话',async()=>{
 const f=setup();assert.equal((await f.service.handle({path:'/api/days',method:'GET'},undefined)).statusCode,401);const a=await f.login();const a2=await f.login();const b=await f.login('user-b');
 assert.equal((await f.call('/api/events','GET',{},a,'user-b')).statusCode,401);
 assert.equal((await f.service.handle({path:'/api/events',method:'GET',token:a,userId:'user-b'},'user-a')).statusCode,400);
 assert.equal((await f.call('/api/session','POST',{openid:'user-b'})).statusCode,400);
 assert.equal((await f.call('/api/session/logout','POST',{},a,'user-b')).statusCode,401);
 assert.equal((await f.call('/api/session/logout','POST',{},a)).statusCode,200);assert.equal((await f.call('/api/session/logout','POST',{},a)).statusCode,200);
 assert.equal((await f.call('/api/events','GET',{},a)).statusCode,401);assert.equal((await f.call('/api/events','GET',{},a2)).statusCode,200);assert.equal((await f.call('/api/events','GET',{},b,'user-b')).statusCode,200);f.expire();assert.equal((await f.call('/api/events','GET',{},a2)).statusCode,401);
});
test('登录生成稳定唯一用户ID，旧资料自动补齐且客户端不能修改',async()=>{
 const f=setup();const legacy={nickName:'旧昵称',avatarVersion:null,avatarFileID:null,eventCount:0};f.repository.put(collections.profiles,owner('user-a'),legacy);
 const a=await f.login();const first=await f.call('/api/profile','GET',{},a);assert.equal(first.statusCode,200);const profile=first.data as {userId:string;nickName:string};assert.match(profile.userId,/^WS-[A-F0-9]{16}$/);assert.equal(profile.nickName,'旧昵称');
 const a2=await f.login();const restored=(await f.call('/api/profile','GET',{},a2)).data as {userId:string};assert.equal(restored.userId,profile.userId);
 const b=await f.login('user-b');const other=(await f.call('/api/profile','GET',{},b,'user-b')).data as {userId:string};assert.notEqual(other.userId,profile.userId);
 assert.equal((await f.call('/api/profile','POST',{nickName:'新昵称',userId:'WS-0000000000000000'},a)).statusCode,400);assert.equal((f.repository.rows.get(collections.profiles+':'+owner('user-a')) as {userId:string}).userId,profile.userId);
});
test('并发独立事件事务分配保存顺序，205条完整分页，幂等冲突和跨账号游标隔离',async()=>{
 const f=setup();const token=await f.login();const inputs=Array.from({length:205},reading);const saved=await Promise.all(inputs.map(input=>f.call('/api/events','POST',input,token)));assert.ok(saved.every(response=>response.statusCode===200));
 const ids:string[]=[];let cursor:undefined|string;let firstCursor='';
 do{const response=await f.call('/api/events','GET',cursor?{cursor}:{},token);assert.equal(response.statusCode,200);const page=response.data as {events:StudyEvent[];nextCursor:string|null};assert.ok(page.events.length<=100);ids.push(...page.events.map(event=>event.id));if(!firstCursor&&page.nextCursor)firstCursor=page.nextCursor;cursor=page.nextCursor??undefined;}while(cursor);
 assert.deepEqual(ids,inputs.map(input=>input.id));assert.equal((await f.call('/api/events','POST',inputs[0],token)).statusCode,200);
 assert.equal((await f.call('/api/events','POST',{...inputs[0],lessonId:courseCatalog[0].content.lessons[1].id},token)).statusCode,409);
 const b=await f.login('user-b');assert.equal((await f.call('/api/events','GET',{cursor:firstCursor},b,'user-b')).statusCode,400);assert.deepEqual((await f.call('/api/events','GET',{},b,'user-b')).data,{events:[],nextCursor:null});
 const info=f.repository.rows.get(collections.profiles+':'+owner('user-a'))!;assert.equal(info.eventCount,205);
 await f.call('/api/profile','POST',{nickName:'测试昵称'},token);assert.equal(f.repository.rows.get(collections.profiles+':'+owner('user-a'))!.eventCount,205);
 f.repository.put(collections.profiles,owner('user-a'),{...info,eventCount:100000});assert.equal((await f.call('/api/events','POST',reading(),token)).statusCode,413);
});
test('测验评分与课程验证在服务器完成，失败不写事件',async()=>{
 const f=setup();const token=await f.login();assert.equal((await f.call('/api/events','POST',{...reading(),day:999},token)).statusCode,400);assert.equal((await f.call('/api/events','POST',{...reading(),type:'quiz',answers:[0]},token)).statusCode,400);
 const result=await f.call('/api/events','POST',{...reading(),type:'quiz',answers:lesson.questions.map(question=>question.answer)},token);assert.equal(result.statusCode,200);assert.equal((result.data as {event:StudyEvent}).event.score,lesson.questions.length);
});
test('计划创建与修改事务幂等，未知计划和未来日期拒绝，账户之间无数据串用',async()=>{
 const f=setup();const token=await f.login();const input={id:randomUUID(),wordsPerDay:10,startedOn:'2026-10-15'};
 const responses=await Promise.all([f.call('/api/plan','POST',input,token),f.call('/api/plan','POST',input,token)]);assert.ok(responses.every(response=>response.statusCode===200));assert.deepEqual(responses[0].data,responses[1].data);
 assert.equal((await f.call('/api/plan','POST',{...input,id:randomUUID()},token)).statusCode,409);assert.equal((await f.call('/api/plan/update','POST',{...input,id:randomUUID()},token)).statusCode,409);
 assert.equal((await f.call('/api/plan/update','POST',{...input,startedOn:'2099-01-01'},token)).statusCode,400);assert.equal((await f.call('/api/plan/update','POST',{...input,wordsPerDay:80},token)).statusCode,200);
 const b=await f.login('user-b');assert.equal((await f.call('/api/plan','GET',{},b,'user-b')).data,null);
});
test('头像真实PNG归一化且仅本人可读base64；拒绝伪造、损坏、超限及任意文件参数',async()=>{
 const f=setup();const token=await f.login();const b=await f.login('user-b');
 assert.equal((await f.call('/api/profile/avatar','PUT',{base64:'fake'},token)).statusCode,415);
 assert.equal((await f.call('/api/profile/avatar','PUT',{base64:'???'},token)).statusCode,400);
 assert.equal((await f.call('/api/profile/avatar','PUT',{base64:Buffer.from([137,80,78,71,13,10,26,10,1]).toString('base64')},token)).statusCode,422);
 assert.equal((await f.call('/api/profile/avatar','PUT',{base64:Buffer.alloc(512*1024+1).toString('base64')},token)).statusCode,413);
 const oversized=await sharp({create:{width:4097,height:1,channels:3,background:'red'}}).png().toBuffer();assert.equal((await f.call('/api/profile/avatar','PUT',{base64:oversized.toString('base64')},token)).statusCode,422);
 const bytes=await sharp({create:{width:20,height:10,channels:3,background:'red'}}).jpeg().toBuffer();const upload=await f.call('/api/profile/avatar','PUT',{base64:bytes.toString('base64')},token);assert.equal(upload.statusCode,200);
 const [fileID,image]=[...f.uploads.entries()][0];const metadata=await sharp(image).metadata();assert.equal(metadata.format,'png');assert.equal(metadata.width,256);assert.ok(fileID.includes('avatars/'+owner('user-a')+'/'));
 assert.equal((await f.call('/api/profile/avatar','GET',{},b,'user-b')).statusCode,404);assert.equal(f.downloaded.length,0);
 assert.equal((await f.call('/api/profile/avatar','GET',{fileID},b,'user-b')).statusCode,400);assert.equal(f.downloaded.length,0);
 const response=await f.call('/api/profile/avatar','GET',{},token);assert.deepEqual(response.data,{base64:image.toString('base64')});assert.deepEqual(f.downloaded,[fileID]);
 f.uploads.set(fileID,Buffer.from('corrupted'));assert.equal((await f.call('/api/profile/avatar','GET',{},token)).statusCode,500);f.uploads.set(fileID,Buffer.alloc(512*1024+1));assert.equal((await f.call('/api/profile/avatar','GET',{},token)).statusCode,500);
});
test('公开课程音频只允许固定目录MP3，不依赖登录会话',async()=>{
 const f=setup();const path='/audio/en-GB/v1/'+'a'.repeat(64)+'.mp3';const fileID='cloud://test.bucket'+path;const bytes=Buffer.concat([Buffer.from('ID3'),Buffer.from('audio')]);f.uploads.set(fileID,bytes);
 const response=await f.call('/api/audio','GET',{path},undefined,'visitor');assert.equal(response.statusCode,200);assert.deepEqual(response.data,{base64:bytes.toString('base64')});assert.equal(f.downloaded.at(-1),fileID);
 assert.equal((await f.call('/api/audio','GET',{path:'/avatars/private.png'})).statusCode,400);assert.equal((await f.call('/api/audio','GET',{path:'/audio/en-GB/v1/../private.mp3'})).statusCode,400);
 f.uploads.set(fileID,Buffer.from('not-mp3'));assert.equal((await f.call('/api/audio','GET',{path})).statusCode,500);
});
test('每日内容和音频匿名只读且不接受客户端文件标识',async()=>{
 const f=setup();const date=today();const fileID='cloud://test/daily-sentences/'+date+'/audio.mp3';const bytes=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(128)]);f.uploads.set(fileID,bytes);
 f.repository.put(collections.dailySentences,date,{date,english:'A careful learner notices one useful detail and applies it during an ordinary conversation.',chinese:'一位认真的学习者发现一个有用的细节，并把它运用到日常对话中。',audioVersion:'a'.repeat(64),audioFileID:fileID,contentHash:'b'.repeat(64),status:'published',generatedAt:Date.now(),model:'hy4',voiceType:101050});
 const content=await f.call('/api/daily-sentence','GET',{},undefined,'visitor');assert.equal(content.statusCode,200);assert.deepEqual(content.data,{date,english:'A careful learner notices one useful detail and applies it during an ordinary conversation.',chinese:'一位认真的学习者发现一个有用的细节，并把它运用到日常对话中。',audioVersion:'a'.repeat(64)});
 const audio=await f.call('/api/daily-sentence/audio','GET',{date},undefined,'visitor');assert.equal(audio.statusCode,200);assert.deepEqual(audio.data,{base64:bytes.toString('base64')});assert.equal((await f.call('/api/daily-sentence/audio','GET',{date,fileID:'cloud://private/other'})).statusCode,400);assert.equal((await f.call('/api/daily-sentence/audio','GET',{date:'2020-01-01'})).statusCode,409);
});
test('损坏的持久资料与分页越界明确500，不替换或截断原数据',async()=>{
 const f=setup();const token=await f.login();const corrupt={nickName:123};f.repository.put(collections.profiles,owner('user-a'),corrupt);assert.equal((await f.call('/api/profile','GET',{},token)).statusCode,500);assert.deepEqual(f.repository.rows.get(collections.profiles+':'+owner('user-a')),corrupt);
 f.repository.eventPage=async()=>[{owner:owner('user-b'),sequence:1,event:{...reading(),createdAt:new Date().toISOString()}}];assert.equal((await f.call('/api/events','GET',{},token)).statusCode,500);
 f.repository.eventPage=async()=>[{owner:owner('user-a'),sequence:2,event:{...reading(),createdAt:new Date().toISOString()}}];assert.equal((await f.call('/api/events','GET',{},token)).statusCode,500);
});
