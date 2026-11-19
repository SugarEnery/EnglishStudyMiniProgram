import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {courseCatalog} from '../src/shared/course-catalog';
import {includesWord} from '../src/shared/lexical';
import {normalizeRecallAnswer,scoreRecall} from '../src/shared/recall';
import {studyEventSchema} from '../src/shared/study-schema';
const course=courseCatalog[0];const lesson=course.content.lessons[0];const word=course.words.find(word=>lesson.paragraphs.some(p=>includesWord(p.en,word)))!;
const input={id:randomUUID(),day:course.day,lessonId:lesson.id,type:'recall' as const,word,answerText:' '+word.toUpperCase()+' '};
test('回忆规范化只忽略明确格式差异，不进行模糊纠错；空答案记错',()=>{
 assert.equal(normalizeRecallAnswer('  ＴＥＡＭ’s\t  work '),"team's work");assert.deepEqual(scoreRecall(input,course),{answers:[1],score:1});assert.deepEqual(scoreRecall({...input,answerText:''},course),{answers:[0],score:0});assert.equal(scoreRecall({...input,answerText:word+'!'},course).score,0);
});
test('回忆目标与情境真实关联，不允许客户端自报结果，持久记录复核评分一致',()=>{
 assert.throws(()=>scoreRecall({...input,word:'not-a-target'},course));assert.throws(()=>scoreRecall({...input,answers:[1]},course));assert.throws(()=>scoreRecall({...input,favorite:true},course));
 const other=course.content.lessons.find(l=>!l.paragraphs.some(p=>includesWord(p.en,word)))!;assert.ok(other);assert.throws(()=>scoreRecall({...input,lessonId:other.id},course));
 const saved={...input,...scoreRecall(input,course),createdAt:new Date().toISOString()};assert.ok(studyEventSchema.safeParse(saved).success);assert.ok(!studyEventSchema.safeParse({...saved,score:0,answers:[0]}).success);assert.ok(!studyEventSchema.safeParse({...saved,answers:[1,1]}).success);
});
