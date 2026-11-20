import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eventSchema,studyEventSchema,studyEventsSchema} from '../src/shared/study-schema';
import {quizQuestions} from '../src/shared/quiz-questions';
import {courseCatalog} from '../src/shared/course-catalog';
const input={id:randomUUID(),day:1,lessonId:'oxford-1-301',type:'quiz',answers:[0,1,2,3,0]};
test('新版测验保留版本，旧请求和旧答卷不自动获得新版标记',()=>{
 assert.equal(eventSchema.parse({...input,quizVersion:'context-v1'}).quizVersion,'context-v1');assert.equal(eventSchema.parse(input).quizVersion,undefined);
 const old={...input,createdAt:'2026-11-19T00:00:00.000Z',score:3};assert.equal(studyEventSchema.parse(old).quizVersion,undefined);assert.equal(studyEventsSchema.parse([old,{...old,id:randomUUID(),quizVersion:'context-v1'}]).length,2);
});
test('其他记录类型和未知测验版本明确拒绝',()=>{
 for(const type of ['read','favorite','recall'])assert.throws(()=>eventSchema.parse({...input,type,quizVersion:'context-v1'}));
 assert.throws(()=>eventSchema.parse({...input,quizVersion:'context-v2'}));assert.throws(()=>studyEventSchema.parse({...input,type:'read',quizVersion:'context-v1',createdAt:'2026-11-19T00:00:00.000Z'}));
 assert.throws(()=>eventSchema.parse({...input,day:2,quizVersion:'context-v1'}));
});
test('两种测验选取各自题库，不存在的情景辨词明确拒绝',()=>{
 const lesson=courseCatalog[0].content.lessons[0];
 assert.equal(quizQuestions(lesson),lesson.questions);assert.equal(quizQuestions(lesson,'context-v1'),lesson.contextQuestions);
 assert.notEqual(lesson.questions[0].prompt,lesson.contextQuestions![0].prompt);
 assert.throws(()=>quizQuestions(courseCatalog[1].content.lessons[0],'context-v1'),/尚未提供/);
 for(const lesson of courseCatalog[0].content.lessons){assert.equal(lesson.questions.length,5);assert.equal(lesson.contextQuestions?.length,5);assert.deepEqual(lesson.questions.map(q=>q.word).sort(),lesson.contextQuestions!.map(q=>q.word).sort());}
});
