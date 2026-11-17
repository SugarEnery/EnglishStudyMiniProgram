import {z} from 'zod';
import {studyEventsSchema} from '../shared/study-schema';
import type {StudyEvent} from '../shared/study-types';
export class SessionExpiredError extends Error {constructor(message='微信登录已过期，请到“我的”重新登录'){super(message);}}
export function cloudEnvironmentId(value:string){
 if(!value.trim())throw Error('尚未配置云开发环境，请填写MINIAPP_CLOUD_ENV_ID后重新编译');
 if(value!==value.trim())throw Error('云开发环境ID不能包含首尾空格，请检查MINIAPP_CLOUD_ENV_ID');
 return value;
}
export function sessionStorageKey(cloudBackend:boolean,env:string,apiBase:string){
 return 'wordscape:session:v2:'+(cloudBackend?'cloud:'+encodeURIComponent(env):'http:'+encodeURIComponent(apiBase));
}
export function responseData<T>(value:unknown):T{
 const parsed=z.object({statusCode:z.number().int().min(100).max(599),data:z.unknown()}).refine(item=>Object.prototype.hasOwnProperty.call(item,'data')).safeParse(value);
 if(!parsed.success)throw Error('学习服务响应格式错误，请检查服务版本');
 const {statusCode,data}=parsed.data;
 if(statusCode===401)throw new SessionExpiredError();
 if(statusCode<200||statusCode>=300){const error=z.object({error:z.string().min(1)}).safeParse(data);throw Error(error.success?error.data.error:`服务请求失败（${statusCode}）`);}
 return data as T;
}
export async function readCloudEvents(fetchPage:(cursor?:string)=>Promise<unknown>):Promise<StudyEvent[]>{
 const pageSchema=z.object({events:studyEventsSchema.refine(items=>items.length<=100),nextCursor:z.string().min(1).nullable()});
 const all:StudyEvent[]=[];const cursors=new Set<string>();const ids=new Set<string>();let cursor:string|undefined;
 do{
  const result=pageSchema.safeParse(await fetchPage(cursor));if(!result.success)throw Error('云端学习记录分页格式错误');
  for(const event of result.data.events){if(ids.has(event.id))throw Error('云端学习记录分页重复，请刷新重试');ids.add(event.id);all.push(event);}
  if(all.length>100000)throw Error('学习记录超过100000条，请联系管理员处理');
  const next=result.data.nextCursor;
  if(next!==null&&(cursors.has(next)||!result.data.events.length))throw Error('云端学习记录分页游标无效，请刷新重试');
  if(next!==null)cursors.add(next);cursor=next??undefined;
 }while(cursor);
 return all;
}
