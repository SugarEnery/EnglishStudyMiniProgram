import {z} from 'zod';
import {tokens} from './daily-types';
import {includesWord} from './lexical';
const text=z.string().trim().min(1).max(3000);
const lexical=z.string().regex(/^[a-z]+(?:['-][a-z]+)*(?: [a-z]+)*$/);
const ipa=z.object({ipa:z.string().regex(/^\/[^\n]{1,100}\/$/)}).strict();
const questionSchema=z.object({word:lexical,type:z.enum(['paraphrase','context','inference','reason','outcome','reference']).optional(),prompt:text,options:z.array(text).length(4),answer:z.number().int().min(0).max(3),explanation:text}).strict();
export const batchSchema=z.object({
 day:z.number().int().positive(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),words:z.array(z.string()).min(1).max(30),
 content:z.object({
 targets:z.record(z.object({ipa:ipa.shape.ipa,meaning:text,senses:z.array(z.object({pos:text.max(30),meaning:text}).strict()).min(1).max(8).optional()}).strict()),dictionary:z.record(text),
 lessons:z.array(z.object({id:z.string().regex(/^oxford-\d+-\d+$/),title:text,subtitle:text,
 paragraphs:z.array(z.object({en:text,zh:text,patterns:z.array(z.object({expression:text,meaning:text}).strict()).min(2).max(3)}).strict()).min(1).max(3),
 questions:z.array(questionSchema).min(1).max(10),contextQuestions:z.array(questionSchema).min(1).max(10).optional()}).strict()).min(3).max(8)
 }).strict(),pronunciations:z.record(ipa)
}).strict();
export function validateBatch(value:unknown,expected:string[]){
 const b=batchSchema.parse(value);
 if(JSON.stringify(b.words)!==JSON.stringify(expected))throw Error('新词必须与该批官方词表完全一致');
 if(JSON.stringify([...Object.keys(b.content.targets)].sort())!==JSON.stringify([...expected].sort()))throw Error('目标词必须完整对应新词');
 if(b.day>=3)for(const w of expected)if(!b.content.targets[w].senses?.length)throw Error('目标词缺少分词性常见义：'+w);
 if(new Date(b.date+'T00:00:00Z').toISOString().slice(0,10)!==b.date)throw Error('日期无效');
 const ids=new Set<string>();const questions=new Set<string>();const questionTypes=new Set<string>();
 for(const l of b.content.lessons){
  if(!l.id.startsWith(`oxford-${b.day}-`)||ids.has(l.id))throw Error('情境编号无效或重复');ids.add(l.id);
  for(const p of l.paragraphs){
   for(const pattern of p.patterns){
    if(!p.en.toLowerCase().includes(pattern.expression.toLowerCase()))throw Error('搭配或句式未出现在本段：'+pattern.expression);
    if(b.day>=2&&(!/^(搭配|句式)：/.test(pattern.meaning)||pattern.meaning.length<18))throw Error('搭配或句式必须标明类型、结构和中文释义：'+pattern.expression);
   }
   for(const w of tokens(p.en))if(!b.content.dictionary[w]||!b.pronunciations[w])throw Error('缺少正文词义或英式音标：'+w);
   for(const w of expected)if(includesWord(p.en,w)&&!p.zh.includes('（'+w+'）'))throw Error('译文缺少英文标注：'+w);
  }
  for(const q of l.questions){
   if(!expected.includes(q.word))throw Error('题目目标词不在本日词表');
   if(b.day!==1&&/[\u3400-\u9fff]/.test(q.prompt))throw Error('题干必须全英文');
   if(q.options.some(o=>/[\u3400-\u9fff]/.test(o))||new Set(q.options).size!==4)throw Error('选项必须全英文且互不相同');questions.add(q.word);
   if(b.day>=3&&!q.type)throw Error('题目缺少英文理解题型：'+q.word);
   if(q.type)questionTypes.add(q.type);
  }
  if(l.contextQuestions){
   if(b.day!==1)throw Error('情景辨词试版仅适用于第1天');
   if(JSON.stringify(l.contextQuestions.map(q=>q.word).sort())!==JSON.stringify(l.questions.map(q=>q.word).sort()))throw Error('两套测验必须覆盖相同目标词');
   for(const q of l.contextQuestions)if(q.options.some(o=>/[\u3400-\u9fff]/.test(o))||new Set(q.options).size!==4)throw Error('情景辨词选项必须全英文且互不相同');
  }
 }
 if(b.day>=3&&questionTypes.size<4)throw Error('每日测验至少需要四种英文理解题型');
 for(const w of expected){
  if(b.content.lessons.filter(l=>l.paragraphs.some(p=>includesWord(p.en,w))).length<2)throw Error('每个新词至少出现于两种情境：'+w);
  if(!questions.has(w))throw Error('缺少目标词测验：'+w);
  if(!b.pronunciations[w]||!b.content.dictionary[w])throw Error('缺少目标词查词数据：'+w);
 }
 return b;
}
