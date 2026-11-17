import {legacyCourses} from '../src/shared/legacy-courses';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import manifest from '../src/content/audio.json';
import {StudyService} from '../server/service';
import {createApi,loadCourses} from '../server/index';

test('完整音频清单对应真实文件、原文和解码校验记录',async()=>{
 const report=JSON.parse(await readFile(new URL('../docs/audio-verification.json',import.meta.url),'utf8'));
 const courses=await loadCourses();
 const expectedKeys=new Set([...courses,...legacyCourses].flatMap(course=>[...Object.keys(course.pronunciations).map(word=>`word:${word}`),...course.content.lessons.flatMap(lesson=>lesson.paragraphs.map((_,index)=>`paragraph:${lesson.id}:${index}`))]));
 assert.deepEqual(Object.keys(manifest).sort(),[...expectedKeys].sort());
 assert.equal(new Set(Object.values(manifest).map(item=>item.path)).size,Object.keys(manifest).length);
 assert.deepEqual(Object.keys(report.entries).sort(),Object.keys(manifest).sort());
 for(const [key,item] of Object.entries(manifest)){
  assert.equal(item.available,true,key);
  const bytes=await readFile(new URL('..'+item.path,import.meta.url));
  const record=report.entries[key];
  assert.equal(record.text,item.text);assert.equal(record.path,item.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
  assert.ok(record.frames>0&&record.sourceFrames>0);assert.ok(record.paddingFrames>=0&&record.paddingFrames<1152);
 }
});

test('单词与段落MP3通过真实HTTP返回完整音频',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'miniapp-audio-http-'));
 const courses=await loadCourses();
 const service=new StudyService(join(folder,'state.json'),courses);
 const server=createApi(service);
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const latest=courses.at(-1)!;
  const latestWord=`word:${latest.words[0]}` as keyof typeof manifest;
  const latestParagraph=`paragraph:${latest.content.lessons[0].id}:0` as keyof typeof manifest;
  for(const item of [manifest['word:read'],manifest['paragraph:oxford-1-1:0'],manifest[latestWord],manifest[latestParagraph]]){
   assert.ok(item);
   const response:Response=await fetch(`http://127.0.0.1:${address.port}${item.path}`);
   assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/mpeg');
   const actual=Buffer.from(await response.arrayBuffer());
   assert.deepEqual(actual,await readFile(new URL('..'+item.path,import.meta.url)));
  }
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
