import {z} from 'zod';
import {planWords} from './daily-plan';
export const MIN_DAILY_WORDS=10;
export const MAX_DAILY_WORDS=80;
export const dailyWordCountSchema=z.number().int().min(MIN_DAILY_WORDS).max(MAX_DAILY_WORDS);
const dateSchema=z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(value=>{const time=Date.parse(value+'T00:00:00Z');return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;},'计划日期无效');
export const createPersonalPlanSchema=z.object({id:z.string().uuid(),wordsPerDay:dailyWordCountSchema,startedOn:dateSchema.optional()}).strict();
export const personalPlanSchema=createPersonalPlanSchema.extend({startedOn:dateSchema,version:z.literal('personal-v1')}).strict();
export const updatePersonalPlanSchema=personalPlanSchema.pick({id:true,wordsPerDay:true,startedOn:true}).strict();
export type PersonalPlan=z.infer<typeof personalPlanSchema>;
export function elapsedPlanDays(plan:PersonalPlan,asOf:string){
 const valid=personalPlanSchema.parse(plan);dateSchema.parse(asOf);
 const days=Math.floor((Date.parse(asOf+'T00:00:00Z')-Date.parse(valid.startedOn+'T00:00:00Z'))/86400000)+1;
 return Math.min(planSummary(valid).totalDays,Math.max(0,days));
}
export function planSummary(plan:PersonalPlan){
 const valid=personalPlanSchema.parse(plan);return planEstimate(valid.wordsPerDay,valid.startedOn);
}
export function planEstimate(wordsPerDay:number,startedOn:string){
 dailyWordCountSchema.parse(wordsPerDay);dateSchema.parse(startedOn);const totalDays=Math.ceil(planWords.length/wordsPerDay);
 return {totalWords:planWords.length,totalDays,endsOn:planDate(startedOn,totalDays-1)};
}
export function planDate(startedOn:string,offset:number){
 dateSchema.parse(startedOn);if(!Number.isInteger(offset)||offset<0)throw Error('计划日期偏移无效');
 return new Date(Date.parse(startedOn+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
}
export function personalPlanDay(plan:PersonalPlan,day:number){
 const valid=personalPlanSchema.parse(plan);const totalDays=Math.ceil(planWords.length/valid.wordsPerDay);
 if(!Number.isInteger(day)||day<1||day>totalDays)throw Error('计划学习日不存在');
 return {day,date:planDate(valid.startedOn,day-1),words:planWords.slice((day-1)*valid.wordsPerDay,day*valid.wordsPerDay).map(entry=>entry.word)};
}
export function parseDailyWordCount(value:string){
 if(!/^\d{2}$/.test(value))throw Error('请输入10至80之间的整数');
 const result=dailyWordCountSchema.safeParse(Number(value));if(!result.success)throw Error('请输入10至80之间的整数');return result.data;
}
