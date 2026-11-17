import {courseCatalog} from '../src/shared/course-catalog';
import test from 'node:test';
import assert from 'node:assert/strict';
import {dayProgress,studyOverview} from '../src/shared/dashboard';
import type {StudyEvent} from '../src/shared/study-types';
const event=(day:number,lessonId:string,type:'read'|'quiz'):StudyEvent=>({id:`${day}:${lessonId}:${type}`,day,lessonId,type,createdAt:'2026-10-21T00:00:00.000Z'});
test('首页与计划不重复计算阅读，必须同一情境同时读完和答题',()=>{
 const events=[event(1,courseCatalog[0].content.lessons[0].id,'read'),event(1,courseCatalog[0].content.lessons[0].id,'read'),event(1,courseCatalog[0].content.lessons[1].id,'quiz'),event(2,courseCatalog[0].content.lessons[0].id,'quiz')];
 assert.deepEqual(dayProgress(1,events),{read:1,quiz:1,finished:0,complete:false});
 assert.deepEqual(dayProgress(1,[...events,event(1,courseCatalog[0].content.lessons[0].id,'quiz')]),{read:1,quiz:2,finished:1,complete:false});
});
test('个人概况只累计已发布且完整完成的课程词数',()=>{
 const records=Array.from({length:6},(_,i)=>[event(1,courseCatalog[0].content.lessons[i].id,'read'),event(1,courseCatalog[0].content.lessons[i].id,'quiz')]).flat();
 records.push(event(999,'unknown','read'));
 assert.equal(dayProgress(1,records).complete,true);
 assert.deepEqual(studyOverview([{day:1,date:'2026-10-14',words:30},{day:2,date:'2026-10-15',words:30}],records),{completedDays:1,completedWords:30,readLessons:6});
});

test('旧版完成记录保留但不会计入随机新课程进度',async()=>{
 const {legacyCourses,legacyCourseFor}=await import('../src/shared/legacy-courses');
 const old=legacyCourses[0];const records=old.content.lessons.flatMap(lesson=>[event(1,lesson.id,'read'),event(1,lesson.id,'quiz')]);
 assert.deepEqual(dayProgress(1,records),{read:0,quiz:0,finished:0,complete:false});
 assert.equal(legacyCourseFor(1,old.content.lessons[0].id)?.words[0],old.words[0]);
 assert.equal(legacyCourseFor(1,courseCatalog[0].content.lessons[0].id),undefined);
});
