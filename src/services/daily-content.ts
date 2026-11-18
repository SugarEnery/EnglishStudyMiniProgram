import {dailyContentSchema,type DailyContent} from '../shared/daily-content';
import {request} from './study';

export async function loadDailyContent():Promise<DailyContent>{
 const result=dailyContentSchema.safeParse(await request('/api/daily-sentence','GET',{},''));if(!result.success)throw Error('今日内容格式无效');return result.data;
}
