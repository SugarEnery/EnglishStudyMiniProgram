import {PLAN_VERSION} from './daily-plan';
import {elapsedPlanDays,personalPlanDay,personalPlanSchema,type PersonalPlan} from './personal-plan';
import type {DaySummary} from './study-types';
export function buildLearningCalendar(plan:PersonalPlan|null,courses:DaySummary[],asOf:string):DaySummary[]{
 if(!plan)return courses.map(course=>({...course}));
 return Array.from({length:elapsedPlanDays(plan,asOf)},(_,index)=>{
  const entry=personalPlanDay(plan,index+1);return {day:entry.day,date:entry.date,words:entry.words.length};
 });
}
export function calendarPlanKey(plan:PersonalPlan|null):string|undefined{
 if(!plan)return undefined;const valid=personalPlanSchema.parse(plan);return JSON.stringify([valid.id,valid.startedOn,valid.wordsPerDay,PLAN_VERSION]);
}
