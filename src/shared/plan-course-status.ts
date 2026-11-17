import type {DaySummary} from './study-types';
import {elapsedPlanDays,personalPlanDay,type PersonalPlan} from './personal-plan';
export function matchesPlanDay(plan:PersonalPlan,day:number,words:string[]){
 const expected=personalPlanDay(plan,day).words;
 return words.length===expected.length&&words.every((word,index)=>word===expected[index]);
}
export function planCourseStatus(plan:PersonalPlan,published:DaySummary[],asOf:string){
 for(const course of published){
  if(!Array.isArray(course.targetWords)||course.targetWords.length!==course.words||course.targetWords.some(word=>typeof word!=='string'||!word.length))throw Error(`第${course.day}天课程目录缺少完整目标词，无法确认课程是否匹配`);
 }
 const total=elapsedPlanDays(plan,asOf);
 const days=Array.from({length:total},(_,index)=>{
  const entry=personalPlanDay(plan,index+1);
  const course=published.find(candidate=>candidate.day===entry.day&&candidate.targetWords!.length===entry.words.length&&candidate.targetWords!.every((word,position)=>word===entry.words[position]));
  return {day:entry.day,date:entry.date,courseDay:course?.day??null};
 });
 const ready=days.filter(day=>day.courseDay!==null).length;
 return {total,ready,missing:total-ready,days};
}
