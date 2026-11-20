import type {Lesson} from './daily-types';

export function quizQuestions(lesson:Lesson,version?:'context-v1'){
 if(version===undefined)return lesson.questions;
 if(!lesson.contextQuestions?.length)throw Error('该情境尚未提供情景辨词题目');
 return lesson.contextQuestions;
}
