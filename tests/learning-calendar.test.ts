import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLearningCalendar,calendarPlanKey} from '../src/shared/learning-calendar';
const plan={id:'9856ad24-d1ec-4a7c-863d-f3c0d518b38f',wordsPerDay:30,startedOn:'2026-10-15',version:'personal-v1' as const};
const courses=[{day:1,date:'2026-10-14',words:30},{day:2,date:'2026-10-15',words:30}];
test('计划日历显示所有已到日期，保留真实课程数组且不制造课程正文',()=>{
 const calendar=buildLearningCalendar(plan,courses,'2026-10-24');assert.equal(calendar.length,10);assert.deepEqual(calendar[0],{day:1,date:'2026-10-15',words:30});assert.equal(calendar[9].date,'2026-10-24');assert.equal(courses.length,2);assert.deepEqual(Object.keys(calendar[9]).sort(),['date','day','words']);
 const original=buildLearningCalendar(null,courses,'2026-10-24');assert.deepEqual(original,courses);assert.notEqual(original,courses);assert.notEqual(original[0],courses[0]);
 assert.equal(buildLearningCalendar(plan,courses,'2026-10-22').length,8);assert.equal(buildLearningCalendar(plan,courses,'2026-10-14').length,0);assert.equal(buildLearningCalendar(plan,courses,'2099-01-01').length,166);
});
test('计划标识包含词序版本，计划信息相同时保持稳定',()=>{
 assert.equal(calendarPlanKey(null),undefined);assert.equal(calendarPlanKey({...plan}),calendarPlanKey(plan));assert.notEqual(calendarPlanKey({...plan,wordsPerDay:40}),calendarPlanKey(plan));assert.notEqual(calendarPlanKey({...plan,startedOn:'2026-10-14'}),calendarPlanKey(plan));
});
