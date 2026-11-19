import Taro from '@tarojs/taro';
import {ensureCloud} from './cloud';
import {responseData,readCloudEvents} from './cloud-protocol';
export {SessionExpiredError} from './cloud-protocol';
import {courseCatalog} from '../shared/course-catalog';
import type {DailyBatch} from '../shared/daily-types';
import {studyEventsSchema} from '../shared/study-schema';
export {completed,favorites,latestQuiz} from '../shared/progress';
import type {EventInput,StudyEvent,DaySummary,SessionResponse} from '../shared/study-types';
import {studyEventSchema,eventSchema} from '../shared/study-schema';
import {scoreRecall,comparableEvent} from '../shared/recall';
export type {EventInput,StudyEvent,DaySummary} from '../shared/study-types';
export type Mode='local'|'wechat';
const localBatches=courseCatalog;
const localKey='wordscape:local:v1:events';
let token='';
export function newId(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return (c==='x'?n:(n&3)|8).toString(16);});}
export async function request<T>(path:string,method:'GET'|'POST'|'PUT'='GET',data?:unknown,credential=token):Promise<T>{
 let res:{statusCode:number;data:unknown};
 if(CLOUD_BACKEND){
  ensureCloud();
  const response=await Taro.cloud.callFunction({name:'study-v2',data:{path,method,...(data===undefined?{}:{data}),token:credential}}).catch((error:unknown)=>{
   const detail=error&&typeof error==='object'&&'errMsg' in error&&typeof error.errMsg==='string'?`：${error.errMsg}`:'';
   throw Error(`学习云函数调用失败${detail}，请检查云环境、study-v2函数部署和网络`);
  });
  return responseData<T>(response.result);
 }else{
  res=await Taro.request({url:API_BASE+path,method,data,header:{'content-type':'application/json',...(credential?{Authorization:`Bearer ${credential}`}:{})}}).catch(()=>{throw Error('无法连接本地学习服务，请检查服务地址与网络');});
 }
 return responseData<T>(res);
}
export async function loginSession():Promise<SessionResponse>{
 let input:{}|{code:string}={};
 if(!CLOUD_BACKEND){const {code}=await Taro.login().catch(()=>{throw Error('微信登录失败，请检查真实AppID及开发者配置');});if(!code)throw Error('微信未返回登录凭证');input={code};}
 const result=await request<SessionResponse>('/api/session','POST',input,'');if(!/^[a-f0-9]{64}$/.test(result.token)||!Number.isFinite(Date.parse(result.expiresAt))||Date.parse(result.expiresAt)<=Date.now())throw Error('服务器会话格式错误');return result;
}
export async function login(){return (await loginSession()).token;}
export function activateSession(value:string){token=value;}
export async function revokeSession(credential:string){
 const result=await request<{ok:boolean}>('/api/session/logout','POST',{},credential);
 if(result.ok!==true)throw Error('退出登录响应无效，请重试');
}
export async function days(mode:Mode):Promise<DaySummary[]>{
 if(mode==='local')return localBatches.map(b=>({day:b.day,date:b.date,words:b.words.length,targetWords:[...b.words]}));
 return (await request<{days:DaySummary[]}>('/api/days')).days;
}
export async function batch(mode:Mode,day:number):Promise<DailyBatch>{
 if(mode==='wechat')return request<DailyBatch>(`/api/days/${day}`);
 const found=localBatches.find(b=>b.day===day);if(!found)throw Error('该课程尚未发布');return found;
}
export async function events(mode:Mode,credential=token):Promise<StudyEvent[]>{
 if(mode==='wechat'){
  if(!CLOUD_BACKEND){const result=studyEventsSchema.safeParse((await request<{events:StudyEvent[]}>('/api/events','GET',undefined,credential)).events);if(!result.success)throw Error('服务器学习记录格式错误');return result.data;}
  return readCloudEvents(cursor=>request('/api/events','GET',cursor?{cursor}:{},credential));
 }
 const saved=Taro.getStorageSync<StudyEvent[]|''>(localKey);
 if(saved==='')return [];
 const result=studyEventsSchema.safeParse(saved);if(!result.success)throw Error('本机学习记录格式错误，已停止读取以保护原记录');return result.data;
}
export async function save(mode:Mode,input:EventInput,lesson:DailyBatch['content']['lessons'][number],known:StudyEvent[],credential=token):Promise<StudyEvent[]>{
 input=eventSchema.parse(input);
 if(mode==='wechat'){const response=await request<{event:StudyEvent}>('/api/events','POST',input,credential);const event=studyEventSchema.parse(response.event);return [...known.filter(e=>e.id!==event.id),event];}
 const all=await events(mode);
 const course=localBatches.find(course=>course.day===input.day);
 if(input.type==='recall'&&(!course||input.lessonId!==lesson.id))throw Error('回忆课程或情境不存在');
 const recall=input.type==='recall'?scoreRecall(input,course!):undefined;
 const existing=all.find(event=>event.id===input.id);
 if(existing){const {createdAt:_,score:__,...original}=existing;if(JSON.stringify(comparableEvent(original))!==JSON.stringify(comparableEvent(input)))throw Error('记录编号已被其他内容使用');return all;}
 const event:StudyEvent={...input,createdAt:new Date().toISOString()};
 if(recall)Object.assign(event,recall);
 if(input.type==='quiz')event.score=lesson.questions.filter((q,i)=>q.answer===input.answers?.[i]).length;
 if(all.length>=100000)throw Error('个人学习记录已达到容量上限');
 const saved=studyEventSchema.parse(event);all.push(saved);Taro.setStorageSync(localKey,all);return all;
}
