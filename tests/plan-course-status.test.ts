import test from 'node:test';
import assert from 'node:assert/strict';
import day1 from '../src/content/day1.json';
import day2 from '../src/content/day2.json';
import {planCourseStatus} from '../src/shared/plan-course-status';
const plan={id:'9856ad24-d1ec-4a7c-863d-f3c0d518b38f',wordsPerDay:30,startedOn:'2026-10-21',version:'personal-v1' as const};
const published=[day1,day2].map(course=>({day:course.day,date:course.date,words:course.words.length,targetWords:course.words}));
test('真实30词两天计划完整匹配两课，日期不影响内容匹配',()=>{
 const status=planCourseStatus(plan,published,'2026-10-22');assert.equal(status.total,2);assert.equal(status.ready,2);assert.equal(status.missing,0);assert.deepEqual(status.days,[{day:1,date:'2026-10-21',courseDay:1},{day:2,date:'2026-10-22',courseDay:2}]);
 assert.equal(planCourseStatus({...plan,startedOn:'2026-10-13'},published,'2026-10-22').missing,8);
});
test('不同词数、相同数量不同目标词、相同词不同顺序都不误判已有课程',()=>{
 assert.equal(planCourseStatus({...plan,wordsPerDay:15},published,'2026-10-22').ready,0);
 const changed=published.map(course=>({...course,targetWords:course.targetWords.map(word=>word+'x')}));assert.equal(planCourseStatus(plan,changed,'2026-10-22').ready,0);
 const reversed=published.map(course=>({...course,targetWords:[...course.targetWords].reverse()}));assert.equal(planCourseStatus(plan,reversed,'2026-10-22').ready,0);
});
test('目录未提供完整目标词明确报错，不按课程编号猜测',()=>{
 assert.throws(()=>planCourseStatus(plan,published.map(({targetWords:_,...course})=>course),'2026-10-22'),/完整目标词/);
 assert.throws(()=>planCourseStatus(plan,[{...published[0],targetWords:[]}],'2026-10-22'),/完整目标词/);
 const remapped=published.map(course=>({...course,day:course.day+10}));assert.deepEqual(planCourseStatus(plan,remapped,'2026-10-22').days.map(day=>day.courseDay),[null,null]);
});
