import type {DailyBatch} from './daily-types';
import type {EventInput} from './study-types';
import {includesWord} from './lexical';
export function normalizeRecallAnswer(value:string){return value.normalize('NFKC').trim().toLowerCase().replace(/[‘’]/g,"'").replace(/\s+/g,' ');}
export function scoreRecall(input:EventInput,course:DailyBatch):{answers:number[];score:number}{
 const lesson=course.content.lessons.find(lesson=>lesson.id===input.lessonId);
 if(input.type!=='recall'||course.day!==input.day||!lesson||!input.word||!course.words.includes(input.word)||!Object.prototype.hasOwnProperty.call(course.content.targets,input.word)||!lesson.paragraphs.some(paragraph=>includesWord(paragraph.en,input.word!)))throw Error('回忆单词必须属于本日课程并出现在当前情境');
 if(typeof input.answerText!=='string'||input.answerText.length>200||input.answers!==undefined||input.favorite!==undefined)throw Error('回忆记录只能提交作答文本，不能自报结果');
 const score=Number(normalizeRecallAnswer(input.answerText)===normalizeRecallAnswer(input.word));return {answers:[score],score};
}
export function comparableEvent(input:EventInput){
 // 回忆事件的answers由保存端产生，不属于重试请求的比较字段。
 if(input.type==='recall'){const {answers:_,...request}=input;return request;}
 return input;
}
