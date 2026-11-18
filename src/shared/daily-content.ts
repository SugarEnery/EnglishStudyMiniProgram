import {z} from 'zod';

export const dateOnlySchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(Date.parse(value+'T00:00:00Z')).toISOString().slice(0,10)===value,'日期无效');
export const generatedDailyTextSchema=z.object({english:z.string().trim().min(40).max(350),chinese:z.string().trim().min(8).max(180)}).strict();
export const dailyContentSchema=generatedDailyTextSchema.extend({date:dateOnlySchema,audioVersion:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type DailyContent=z.infer<typeof dailyContentSchema>;

export function validateGeneratedDailyText(value:unknown){
 const content=generatedDailyTextSchema.parse(value);const words=content.english.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)??[];
 if(words.length<12||words.length>50||/[^\x20-\x7E]/.test(content.english))throw Error('每日英文须为12至50词的标准英文文本');
 if(!/[。！？]/.test(content.chinese)||!/[\u3400-\u9fff]/.test(content.chinese))throw Error('每日中文译文格式无效');
 return content;
}
