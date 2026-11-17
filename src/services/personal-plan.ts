import Taro from '@tarojs/taro';
import {request,type Mode} from './study';
import {today} from '../shared/daily-plan';
import {createPersonalPlanSchema,personalPlanSchema,updatePersonalPlanSchema,type PersonalPlan} from '../shared/personal-plan';
const localKey='wordscape:local:v1:personal-plan';
export async function loadPlan(mode:Mode,token?:string):Promise<PersonalPlan|null>{
 if(mode==='wechat')return personalPlanSchema.nullable().parse(await request('/api/plan','GET',undefined,token));
 const raw=Taro.getStorageSync(localKey);if(raw==='')return null;
 const result=personalPlanSchema.safeParse(raw);if(!result.success)throw Error('本机计划格式错误，已停止读取以保护原计划');return result.data;
}
export async function createPlan(mode:Mode,input:{id:string;wordsPerDay:number;startedOn?:string},token?:string):Promise<PersonalPlan>{
 const valid=createPersonalPlanSchema.parse(input);
 if(valid.startedOn&&valid.startedOn>today())throw Error('计划开始日期不能晚于今天');
 if(mode==='wechat')return personalPlanSchema.parse(await request('/api/plan','POST',valid,token));
 const current=await loadPlan(mode);
 if(current){if(current.id===valid.id&&current.wordsPerDay===valid.wordsPerDay&&(!valid.startedOn||current.startedOn===valid.startedOn))return current;throw Error('已开始学习计划，请先查看现有计划');}
 const plan=personalPlanSchema.parse({...valid,startedOn:valid.startedOn??today(),version:'personal-v1'});
 Taro.setStorageSync(localKey,plan);return plan;
}
export async function updatePlan(mode:Mode,input:{id:string;wordsPerDay:number;startedOn:string},token?:string):Promise<PersonalPlan>{
 const valid=updatePersonalPlanSchema.parse(input);if(valid.startedOn>today())throw Error('计划开始日期不能晚于今天');
 if(mode==='wechat')return personalPlanSchema.parse(await request('/api/plan/update','POST',valid,token));
 const current=await loadPlan(mode);if(!current||current.id!==valid.id)throw Error('原学习计划不存在或编号不一致');
 const plan=personalPlanSchema.parse({...current,...valid});Taro.setStorageSync(localKey,plan);return plan;
}
