import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {z} from 'zod';
const root=new URL('../',import.meta.url);await mkdir(new URL('audio/',root),{recursive:true});
const manifest={};
const days=z.array(z.number().int().positive()).min(1).refine(items=>items.every((day,index)=>day===index+1),'课程目录必须从第1天开始连续排列').parse(JSON.parse(await readFile(new URL('src/content/catalog.json',root),'utf8')));
const legacyDays=z.array(z.number().int().positive()).parse(JSON.parse(await readFile(new URL('src/content/legacy-v1/catalog.json',root),'utf8')));
for(const path of [...days.map(day=>`src/content/day${day}.json`),...legacyDays.map(day=>`src/content/legacy-v1/day${day}.json`)]){
 const batch=JSON.parse(await readFile(new URL(path,root),'utf8'));
 const entries=[...Object.keys(batch.pronunciations).map(word=>[`word:${word}`,word]),...batch.content.lessons.flatMap(l=>l.paragraphs.map((p,i)=>[`paragraph:${l.id}:${i}`,p.en]))];
 for(const [key,text] of entries){
  const hash=createHash('sha256').update('en-GB|v1|'+text).digest('hex');const path=`audio/en-GB/v1/${hash}.mp3`;
  let available=false;try{available=(await stat(new URL(path,root))).size>0;}catch(e){if(e.code!=='ENOENT')throw e;}
  manifest[key]={path:'/'+path,available,text,voice:'en-GB',version:1};
 }
}
await writeFile(new URL('src/content/audio.json',root),JSON.stringify(manifest,null,2)+'\n');
const missing=Object.values(manifest).filter(a=>!a.available).length;
console.log(`音频清单：${Object.keys(manifest).length}条，缺失${missing}条（播放时明确报错）`);
if(process.argv.includes('--strict')&&missing)process.exitCode=1;
