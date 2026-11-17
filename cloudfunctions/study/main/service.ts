import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {courseCatalog} from '../../../src/shared/course-catalog';
import {plan,today} from '../../../src/shared/daily-plan';
import {tokens} from '../../../src/shared/daily-types';
import {includesWord} from '../../../src/shared/lexical';
import {eventSchema,studyEventSchema} from '../../../src/shared/study-schema';
import {profileUpdateSchema} from '../../../src/shared/profile-schema';
import {personalPlanSchema,createPersonalPlanSchema,updatePersonalPlanSchema} from '../../../src/shared/personal-plan';
import {collections,type Repository,type Transaction,type Storage} from './repository';
import {normalizeAvatar,validateStoredAvatar} from './image';
import {CloudError} from './errors';
export {CloudError} from './errors';

const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const ownerSchema=z.string().regex(/^[a-f0-9]{64}$/);
const sessionSchema=z.object({owner:ownerSchema,expiresAt:z.number().finite()}).strict();
const userIdSchema=z.string().regex(/^WS-[A-F0-9]{16}$/);
const legacyProfileSchema=z.object({nickName:z.string().max(40),avatarVersion:ownerSchema.nullable(),avatarFileID:z.string().min(1).nullable(),eventCount:z.number().int().min(0).max(100000)}).strict();
const profileSchema=legacyProfileSchema.extend({userId:userIdSchema}).strict();
const eventRowSchema=z.object({owner:ownerSchema,sequence:z.number().int().positive().max(100000),event:studyEventSchema}).strict();
const planRowSchema=z.object({owner:ownerSchema,plan:personalPlanSchema}).strict();
const cursorSchema=z.object({owner:ownerSchema,sequence:z.number().int().positive().max(100000)}).strict();
const requestSchema=z.object({path:z.string().min(1).max(160),method:z.enum(['GET','POST','PUT']),data:z.unknown().optional(),token:z.string().optional()}).strict();
const userIdFor=(owner:string)=>`WS-${hash(`wordscape-user-id:v1:${owner}`).slice(0,16).toUpperCase()}`;
const emptyProfile=(owner:string)=>({userId:userIdFor(owner),nickName:'',avatarVersion:null,avatarFileID:null,eventCount:0});
function stored<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw Error('云端持久数据格式损坏');return result.data;}
const publicProfile=(profile:z.infer<typeof profileSchema>)=>({userId:profile.userId,nickName:profile.nickName,hasAvatar:Boolean(profile.avatarVersion),avatarVersion:profile.avatarVersion});
export type CloudResponse={statusCode:number;data:unknown};
export function createStudyService(repository:Repository,storage:Storage,options:{audioStorageRoot:string;now?:()=>number;reportError?:(error:unknown)=>void}){
 const now=options.now??Date.now;
 if(!/^cloud:\/\/[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/.test(options.audioStorageRoot))throw Error('音频云存储根目录无效');
 function tokenKey(token:string|undefined){if(!token||!/^[a-f0-9]{64}$/.test(token))throw new CloudError(401,'请先微信登录');return hash(token);}
 async function authorize(tx:Transaction,owner:string,token:string|undefined){const key=tokenKey(token);const raw=await tx.get(collections.sessions,key);if(!raw)throw new CloudError(401,'登录已失效，请重新登录');const session=stored(sessionSchema,raw);if(session.owner!==owner||session.expiresAt<=now())throw new CloudError(401,'登录已失效，请重新登录');}
 async function profile(tx:Transaction,owner:string){const raw=await tx.get(collections.profiles,owner);if(!raw)return emptyProfile(owner);const current=profileSchema.safeParse(raw);if(current.success)return current.data;const legacy=legacyProfileSchema.safeParse(raw);if(legacy.success)return {...legacy.data,userId:userIdFor(owner)};throw Error('云端持久数据格式损坏');}
 async function authenticated<T>(owner:string,token:string|undefined,action:(tx:Transaction)=>Promise<T>){return repository.transaction(async tx=>{await authorize(tx,owner,token);return action(tx);});}
 async function dispatch(input:unknown,openid:string|undefined):Promise<unknown>{
  if(typeof openid!=='string'||!openid.trim())throw new CloudError(401,'缺少微信身份，请从小程序调用云函数');
  const request=requestSchema.parse(input);const owner=hash(openid);const {path,method,data,token}=request;
  if(Buffer.byteLength(JSON.stringify(request),'utf8')>(path==='/api/profile/avatar'?740*1024:16384))throw new CloudError(413,'请求内容过大');
  if(path==='/api/session'&&method==='POST'){
   z.object({}).strict().parse(data??{});const value=randomBytes(32).toString('hex');const expiresAt=now()+7*86400000;
   await repository.transaction(async tx=>{await tx.set(collections.sessions,hash(value),{owner,expiresAt});await tx.set(collections.profiles,owner,await profile(tx,owner));});return {token:value,expiresAt:new Date(expiresAt).toISOString()};
  }
  if(path==='/api/session/logout'&&method==='POST'){
   const key=tokenKey(token);return repository.transaction(async tx=>{const raw=await tx.get(collections.sessions,key);if(raw&&stored(sessionSchema,raw).owner!==owner)throw new CloudError(401,'微信身份与登录会话不一致');z.object({}).strict().parse(data??{});if(raw)await tx.remove(collections.sessions,key);return {ok:true};});
  }
  if(path==='/api/days'&&method==='GET'){z.object({}).strict().parse(data??{});return {days:courseCatalog.map(course=>({day:course.day,date:course.date,words:course.words.length,targetWords:[...course.words]})),plan};}
  if(/^\/api\/days\/[1-9]\d*$/.test(path)&&method==='GET'){z.object({}).strict().parse(data??{});const course=courseCatalog.find(course=>course.day===Number(path.split('/').pop()));if(!course)throw new CloudError(404,'当天课程尚未发布');return course;}
  if(path==='/api/audio'&&method==='GET'){
   const input=z.object({path:z.string().regex(/^\/audio\/en-GB\/v[1-9]\d*\/[a-f0-9]{64}\.mp3$/)}).strict().parse(data);let bytes:Buffer;
   try{bytes=await storage.download(options.audioStorageRoot+input.path);}catch(error){options.reportError?.(error);throw new CloudError(503,'英式音频读取服务暂时不可用，请稍后重试');}
   if(!bytes.length||bytes.length>512*1024)throw Error('云端音频文件大小无效');
   if(bytes.subarray(0,3).toString('ascii')!=='ID3'&&!(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0))throw Error('云端音频文件格式无效');
   return {base64:bytes.toString('base64')};
  }
  if(path==='/api/events'&&method==='GET'){
   await authenticated(owner,token,async()=>undefined);const query=z.object({cursor:z.string().max(300).optional()}).strict().parse(data??{});let after=0;
   if(query.cursor){let parsed:unknown;try{parsed=JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'));}catch{throw new CloudError(400,'学习记录游标无效');}const cursor=cursorSchema.safeParse(parsed);if(!cursor.success||cursor.data.owner!==owner)throw new CloudError(400,'学习记录游标无效');after=cursor.data.sequence;}
   const rows=(await repository.eventPage(owner,after,100)).map(row=>stored(eventRowSchema,row));
   let previous=after;for(const row of rows){if(row.owner!==owner||row.sequence!==previous+1)throw Error('云端事件分页顺序、完整性或归属错误');previous=row.sequence;}
   if(rows.length>100)throw Error('云端事件分页超过限制');
   return {events:rows.map(row=>row.event),nextCursor:rows.length===100?Buffer.from(JSON.stringify({owner,sequence:previous})).toString('base64url'):null};
  }
  if(path==='/api/events'&&method==='POST')return authenticated(owner,token,async tx=>{
   const event=eventSchema.parse(data);const course=courseCatalog.find(course=>course.day===event.day);const lesson=course?.content.lessons.find(lesson=>lesson.id===event.lessonId);if(!course||!lesson)throw new CloudError(400,'学习日或情境不存在');
   if(event.type==='quiz'){if(!event.answers||event.answers.length!==lesson.questions.length||event.word!==undefined||event.favorite!==undefined)throw new CloudError(400,'测验答案数量或字段无效');}
   else if(event.type==='favorite'){const vocabulary=new Set(lesson.paragraphs.flatMap(paragraph=>tokens(paragraph.en)));if(!event.word||!course.content.dictionary[event.word]||(!vocabulary.has(event.word)&&!lesson.paragraphs.some(paragraph=>includesWord(paragraph.en,event.word!)))||event.favorite===undefined||event.answers!==undefined)throw new CloudError(400,'收藏单词或字段无效');}
   else if(event.word!==undefined||event.favorite!==undefined||event.answers!==undefined)throw new CloudError(400,'阅读记录字段无效');
   const id=`${owner}_${event.id}`;const existing=await tx.get(collections.events,id);
   if(existing){const row=stored(eventRowSchema,existing);if(row.owner!==owner)throw Error('云端事件归属错误');const {createdAt:_,score:__,...original}=row.event;if(JSON.stringify(original)!==JSON.stringify(event))throw new CloudError(409,'记录编号已被其他内容使用');return {event:row.event};}
   const info=await profile(tx,owner);if(info.eventCount>=100000)throw new CloudError(413,'个人学习记录已达到容量上限');
   const saved=studyEventSchema.parse({...event,createdAt:new Date(now()).toISOString(),...(event.type==='quiz'?{score:event.answers!.filter((answer,index)=>answer===lesson.questions[index].answer).length}:{})});
   await tx.set(collections.profiles,owner,{...info,eventCount:info.eventCount+1});await tx.set(collections.events,id,{owner,sequence:info.eventCount+1,event:saved});return {event:saved};
  });
  if(path==='/api/profile'&&(method==='GET'||method==='POST'))return authenticated(owner,token,async tx=>{const info=await profile(tx,owner);if(method==='POST'){const patch=profileUpdateSchema.parse(data);Object.assign(info,patch);await tx.set(collections.profiles,owner,info);}else z.object({}).strict().parse(data??{});return publicProfile(info);});
  if(path==='/api/profile/avatar'&&method==='PUT'){
   await authenticated(owner,token,async()=>undefined);const upload=z.object({base64:z.string()}).strict().parse(data);const bytes=await normalizeAvatar(upload.base64);const version=hash(bytes);let fileID:string;try{fileID=await storage.upload(`avatars/${owner}/${version}.png`,bytes);}catch(error){options.reportError?.(error);throw new CloudError(503,'头像上传服务暂时不可用，请稍后重试');}
   return authenticated(owner,token,async tx=>{const info=await profile(tx,owner);const updated={...info,avatarVersion:version,avatarFileID:fileID};await tx.set(collections.profiles,owner,updated);return publicProfile(updated);});
  }
  if(path==='/api/profile/avatar'&&method==='GET'){
   const fileID=await authenticated(owner,token,async tx=>{z.object({}).strict().parse(data??{});const info=await profile(tx,owner);if(!info.avatarFileID||!info.avatarVersion)throw new CloudError(404,'尚未设置头像');return info.avatarFileID;});let bytes:Buffer;try{bytes=await storage.download(fileID);}catch(error){options.reportError?.(error);throw new CloudError(503,'头像读取服务暂时不可用，请稍后重试');}await validateStoredAvatar(bytes);return {base64:bytes.toString('base64')};
  }
  if((path==='/api/plan'&&(method==='GET'||method==='POST'))||(path==='/api/plan/update'&&method==='POST'))return authenticated(owner,token,async tx=>{
   const raw=await tx.get(collections.plans,owner);const existing=raw?stored(planRowSchema,raw):null;if(existing&&existing.owner!==owner)throw Error('云端计划归属错误');if(method==='GET'){z.object({}).strict().parse(data??{});return existing?.plan??null;}
   const updating=path.endsWith('/update');const request=updating?updatePersonalPlanSchema.parse(data):createPersonalPlanSchema.parse(data);if(request.startedOn&&request.startedOn>today())throw new CloudError(400,'计划开始日期不能晚于今天');
   if(updating&&(!existing||existing.plan.id!==request.id))throw new CloudError(409,'原计划不存在或编号不一致');
   if(!updating&&existing){if(existing.plan.id!==request.id||existing.plan.wordsPerDay!==request.wordsPerDay||(request.startedOn&&request.startedOn!==existing.plan.startedOn))throw new CloudError(409,'个人计划已存在且内容不同');return existing.plan;}
   const value=personalPlanSchema.parse({...request,startedOn:request.startedOn??today(),version:'personal-v1'});await tx.set(collections.plans,owner,{owner,plan:value});return value;
  });
  throw new CloudError(404,'接口或请求方法不存在');
 }
 return {handle:async(input:unknown,openid:string|undefined):Promise<CloudResponse>=>{
  try{return {statusCode:200,data:await dispatch(input,openid)};}catch(error){const status=error instanceof CloudError?error.status:error instanceof z.ZodError?400:500;if(status===500)options.reportError?.(error);return {statusCode:status,data:{error:status===500?'云端服务异常，请联系维护者':error instanceof Error?error.message:'请求失败'}};}
 }};
}
