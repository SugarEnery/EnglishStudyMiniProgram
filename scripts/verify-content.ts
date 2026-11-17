import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {validateBatch} from '../src/shared/daily-validation';
import {wordsForDay,dateForDay} from '../src/shared/daily-plan';
const days=z.array(z.number().int().positive()).min(1).refine(items=>items.every((day,index)=>day===index+1),'课程目录必须从第1天开始连续排列').parse(JSON.parse(await readFile(new URL('../src/content/catalog.json',import.meta.url),'utf8')));
for(const day of days){
 const batch=validateBatch(JSON.parse(await readFile(new URL(`../src/content/day${day}.json`,import.meta.url),'utf8')),wordsForDay(day));
 if(batch.day!==day||batch.date!==dateForDay(day)||batch.content.lessons.length!==6)throw Error(`第${day}天日期或情境数量错误`);
}
console.log(`课程检查：${days.length}通过，0失败`);
