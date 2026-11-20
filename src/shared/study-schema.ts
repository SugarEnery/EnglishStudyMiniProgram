import { z } from 'zod';
import {normalizeRecallAnswer} from './recall';

const eventObject = z.object({
  id: z.string().uuid(), day: z.number().int().positive(), lessonId: z.string().min(1),
  type: z.enum(['read', 'quiz', 'favorite','recall']), word: z.string().min(1).optional(),
  answerText:z.string().max(200).optional(),
  quizVersion:z.literal('context-v1').optional(),
  favorite: z.boolean().optional(), answers: z.array(z.number().int().min(0).max(3)).max(10).optional(),
}).strict();
function validateQuizVersion(event:{type:string;day:number;quizVersion?:string},context:z.RefinementCtx){
 if(event.quizVersion!==undefined&&event.type!=='quiz')context.addIssue({code:z.ZodIssueCode.custom,message:'只有测验记录可以携带题目版本'});
 if(event.quizVersion==='context-v1'&&event.day!==1)context.addIssue({code:z.ZodIssueCode.custom,message:'情景辨词试版仅适用于第1天'});
}
export const eventSchema=eventObject.superRefine(validateQuizVersion);
export const studyEventSchema = eventObject.extend({
  createdAt: z.string().datetime(), score: z.number().int().min(0).max(10).optional(),
}).strict().superRefine((event,context)=>{
 validateQuizVersion(event,context);
 if(event.type==='recall'){
  const score=event.word!==undefined&&event.answerText!==undefined?Number(normalizeRecallAnswer(event.word)===normalizeRecallAnswer(event.answerText)):-1;
  if(score<0||event.answers?.length!==1||event.answers[0]!==score||event.score!==score||event.favorite!==undefined)context.addIssue({code:z.ZodIssueCode.custom,message:'回忆记录缺少有效的保存端评分'});
 }else if(event.answerText!==undefined)context.addIssue({code:z.ZodIssueCode.custom,message:'此记录类型不接受回忆作答文本'});
});
export const studyEventsSchema = z.array(studyEventSchema).max(100000);
