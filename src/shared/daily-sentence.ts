import {courseCatalog} from './course-catalog';

const DAY_MS=86400000;

export type DailySentence={date:string;en:string;zh:string;audioKey:string};

function dayNumber(date:string){
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);if(!match)throw Error('每日一句日期格式无效');
 const value=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]));
 if(new Date(value).toISOString().slice(0,10)!==date)throw Error('每日一句日期无效');
 return Math.floor(value/DAY_MS);
}

const sentences=courseCatalog.flatMap(course=>course.content.lessons.flatMap(lesson=>lesson.paragraphs.map((paragraph,index)=>({en:paragraph.en,zh:paragraph.zh,audioKey:`paragraph:${lesson.id}:${index}`}))));
if(sentences.length===0)throw Error('每日一句内容池为空');

/** 同一自然日固定展示一条，日期变化时顺序切换。 */
export function dailySentence(date:string):DailySentence{
 const sentence=sentences[((dayNumber(date)%sentences.length)+sentences.length)%sentences.length];
 return {date,...sentence};
}

export const dailySentenceCount=sentences.length;
