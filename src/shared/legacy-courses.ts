import day1 from '../content/legacy-v1/day1.json';
import day2 from '../content/legacy-v1/day2.json';
import day3 from '../content/legacy-v1/day3.json';
import days from '../content/legacy-v1/catalog.json';
import type {DailyBatch} from './daily-types';
// 已保存记录仍按原情境回看，不把旧答案套到新课程。
export const legacyCourses=[day1,day2,day3] as DailyBatch[];
export function legacyCourseFor(day:number,lessonId:string){return legacyCourses.find(course=>course.day===day&&course.content.lessons.some(lesson=>lesson.id===lessonId));}

if(days.length!==legacyCourses.length||days.some((day,index)=>legacyCourses[index].day!==day))throw Error('旧课程归档目录不一致');
