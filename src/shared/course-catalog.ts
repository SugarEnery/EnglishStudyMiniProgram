import day1 from '../content/day1.json';
import day2 from '../content/day2.json';
import day3 from '../content/day3.json';
import days from '../content/catalog.json';
import type {DailyBatch} from './daily-types';

// 微信小程序需静态引用课程；构建时严格核对统一目录，避免漏接新课程。
export const courseCatalog=[day1,day2,day3] as DailyBatch[];
if(days.length!==courseCatalog.length||days.some((day,index)=>day!==index+1||courseCatalog[index].day!==day))throw Error('本机课程与发布目录不一致');
