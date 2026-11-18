import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateBatch} from '../src/shared/daily-validation';
import {wordsForDay,dateForDay,planWords,plan} from '../src/shared/daily-plan';
import {readingParts,includesWord} from '../src/shared/lexical';
import audio from '../src/content/audio.json';
import catalogDays from '../src/content/catalog.json';
import {courseCatalog} from '../src/shared/course-catalog';
import {dailySentence,dailySentenceCount} from '../src/shared/daily-sentence';
for(const day of catalogDays)test(`第${day}天课程完整且来源可追溯`,async()=>{
 const local=await readFile(new URL(`../src/content/day${day}.json`,import.meta.url),'utf8');
 {const provenance=JSON.parse(await readFile(new URL('../docs/content-provenance.json',import.meta.url),'utf8'));assert.equal(createHash('sha256').update(local).digest('hex'),provenance[`day${day}.json`]);}
 const course=validateBatch(JSON.parse(local),wordsForDay(day));assert.equal(course.date,dateForDay(day));assert.equal(course.content.lessons.length,6);
 for(const lesson of course.content.lessons)for(const [i,p] of lesson.paragraphs.entries()){
  const item=audio[`paragraph:${lesson.id}:${i}` as keyof typeof audio];assert.ok(item);assert.equal(item.text,p.en);assert.equal(item.path,'/audio/en-GB/v1/'+createHash('sha256').update('en-GB|v1|'+p.en).digest('hex')+'.mp3');
 }
});
test('全量随机计划覆盖全部词且无重复',()=>{assert.equal(planWords.length,plan.totalWords);assert.equal(new Set(planWords.map(w=>w.word)).size,plan.totalWords);assert.equal(wordsForDay(2).length,30);});
test('词组保持完整且不误匹配词内片段',()=>{assert.ok(readingParts('An ice cream and a T-shirt.', ['ice cream','t-shirt']).includes('ice cream'));assert.equal(includesWord('Another answer','an'),false);});
test('共享逻辑与已记录的网站来源一致',async()=>{const provenance=JSON.parse(await readFile(new URL('../docs/content-provenance.json',import.meta.url),'utf8'));for(const file of ['daily-types.ts','daily-validation.ts','lexical.ts','oxford-wordlist.json']){const local=await readFile(new URL('../src/shared/'+file,import.meta.url));assert.equal(createHash('sha256').update(local).digest('hex'),provenance[file]);}});
test('每日一句同日固定、隔日更新且音频来自真实清单',()=>{
 assert.equal(dailySentenceCount,36);const first=dailySentence('2026-11-18');const same=dailySentence('2026-11-18');const next=dailySentence('2026-11-19');assert.deepEqual(first,same);assert.notEqual(first.audioKey,next.audioKey);assert.ok(first.en&&first.zh);assert.ok(audio[first.audioKey as keyof typeof audio]?.available);assert.ok(audio[next.audioKey as keyof typeof audio]?.available);assert.throws(()=>dailySentence('2026-02-30'),/日期无效/);
});

test('本机和服务端使用相同的已发布课程目录',()=>{assert.deepEqual(courseCatalog.map(course=>course.day),catalogDays);});
for(const day of catalogDays)test(`第${day}天随机课程满足双段短文、词性、复现和英文理解测验要求`,()=>{
 const course=validateBatch(courseCatalog[day-1],wordsForDay(day));
 assert.equal(course.date,dateForDay(day));assert.equal(course.content.lessons.length,6);
 const questions=course.content.lessons.flatMap(lesson=>lesson.questions);
 assert.equal(questions.length,30);assert.ok(new Set(questions.map(question=>question.type)).size>=4);
 for(const lesson of course.content.lessons){assert.equal(lesson.paragraphs.length,2);assert.equal(lesson.questions.length,5);}
 for(const word of course.words){assert.ok(course.content.targets[word].senses?.length);assert.equal(questions.filter(question=>question.word===word).length,1);assert.ok(course.content.lessons.filter(lesson=>lesson.paragraphs.some(paragraph=>includesWord(paragraph.en,word))).length>=2);}
});

test('第1天参与全词库洗牌且固定版本顺序不随重启改变',async()=>{
 const original=JSON.parse(await readFile(new URL('../src/shared/oxford-wordlist.json',import.meta.url),'utf8')).words.map((entry:{word:string})=>entry.word.toLowerCase().replaceAll('’',"'"));
 assert.deepEqual([...planWords.map(entry=>entry.word)].sort(),[...original].sort());
 assert.notDeepEqual(wordsForDay(1),original.slice(0,30));
 assert.equal(wordsForDay(1)[0],'investigate');
 assert.equal(createHash('sha256').update(JSON.stringify(planWords.map(entry=>entry.word))).digest('hex'),'fa1c40cf9ff24681da20f7178dca7a7db301794a6b50fd400d2200b0c31eb924');
});

test('旧课程归档保持完整且新旧情境编号互不重叠',async()=>{
 const {legacyCourses}=await import('../src/shared/legacy-courses');
 for(const old of legacyCourses){validateBatch(old,old.words);const current=courseCatalog.find(course=>course.day===old.day)!;assert.ok(old.content.lessons.every(lesson=>!current.content.lessons.some(item=>item.id===lesson.id)));}
});
