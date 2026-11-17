import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {planWords} from '../src/shared/daily-plan';
import {personalPlanSchema,parseDailyWordCount,personalPlanDay,planSummary,planEstimate,planDate,elapsedPlanDays,updatePersonalPlanSchema,createPersonalPlanSchema} from '../src/shared/personal-plan';
const plan=(wordsPerDay:number)=>({id:randomUUID(),wordsPerDay,startedOn:'2026-10-21',version:'personal-v1' as const});
test('10至80所有整数的计划都完整覆盖真实词表，不重不漏，最后一天准确收尾',()=>{
 const expected=planWords.map(entry=>entry.word);assert.equal(expected.length,4952);assert.equal(new Set(expected).size,expected.length);
 for(let count=10;count<=80;count++){
  const value=plan(count);const summary=planSummary(value);assert.equal(summary.totalDays,Math.ceil(expected.length/count));
  const all:string[]=[];for(let day=1;day<=summary.totalDays;day++){const batch=personalPlanDay(value,day);assert.equal(batch.words.length,day===summary.totalDays?expected.length-(day-1)*count:count);all.push(...batch.words);}
  assert.deepEqual(all,expected);assert.equal(summary.endsOn,personalPlanDay(value,summary.totalDays).date);
 }
});
test('已到学习日从开始日期计入当天，跨月闰年和计划结束边界准确',()=>{
 const value={...plan(30),startedOn:'2026-10-15'};assert.equal(elapsedPlanDays(value,'2026-10-22'),8);assert.equal(elapsedPlanDays(value,'2026-10-14'),0);assert.equal(elapsedPlanDays(value,'2026-10-15'),1);
 assert.equal(elapsedPlanDays({...value,startedOn:'2026-09-30'},'2026-10-02'),3);assert.equal(elapsedPlanDays({...value,startedOn:'2028-02-28'},'2028-03-01'),3);assert.equal(elapsedPlanDays(value,'2099-01-01'),planSummary(value).totalDays);
 for(const date of ['2026-02-30','2026-13-01','22/10/2026'])assert.throws(()=>elapsedPlanDays(value,date));
 assert.equal(createPersonalPlanSchema.parse({id:value.id,wordsPerDay:10}).startedOn,undefined);assert.throws(()=>updatePersonalPlanSchema.parse({id:value.id,wordsPerDay:10}));assert.throws(()=>updatePersonalPlanSchema.parse({...value,version:'personal-v1'}));
});
test('词数只允许10至80整数，错误输入明确拒绝',()=>{
 for(const value of ['','9','81','100','10.5','-10','NaN','30a',' 30','030'])assert.throws(()=>parseDailyWordCount(value));
 for(const count of [10,37,80])assert.equal(parseDailyWordCount(String(count)),count);
 for(const count of [9,81,30.5,NaN])assert.throws(()=>personalPlanSchema.parse(plan(count)));
});
test('日期跨月跨年与闰年准确，非法日期和学习日拒绝',()=>{
 assert.equal(planDate('2026-12-31',1),'2027-01-01');assert.equal(planDate('2028-02-28',1),'2028-02-29');assert.equal(planDate('2028-02-28',2),'2028-03-01');
 assert.throws(()=>planSummary({...plan(10),startedOn:'2026-02-30'}));
 for(const day of [0,-1,1.5,497])assert.throws(()=>personalPlanDay(plan(10),day));
 assert.equal(planEstimate(10,'2026-10-21').totalDays,496);assert.equal(planEstimate(80,'2026-10-21').totalDays,62);
});
