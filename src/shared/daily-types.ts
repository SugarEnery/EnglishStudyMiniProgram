export type QuestionType='paraphrase'|'context'|'inference'|'reason'|'outcome'|'reference';
export type Lesson = {id:string;title:string;subtitle:string;paragraphs:{en:string;zh:string;patterns:{expression:string;meaning:string}[]}[];questions:{word:string;type?:QuestionType;prompt:string;options:string[];answer:number;explanation:string}[]};
export type TargetSense={pos:string;meaning:string};
export type Content = {targets:Record<string,{ipa:string;meaning:string;senses?:TargetSense[]}>;dictionary:Record<string,string>;lessons:Lesson[]};
export type DailyBatch = {day:number;date:string;words:string[];content:Content;pronunciations:Record<string,{ipa:string}>};
export function tokens(text:string){return text.toLowerCase().match(/[a-z]+(?:['’][a-z]+)*/g)?.map(w=>w.replace('’',"'"))??[]}
