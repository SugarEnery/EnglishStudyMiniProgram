import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateCloudInputs,validatePackDirectory,packFiles} from '../scripts/build-cloud.mjs';

const sourceRoot='/project';
const metadata=extra=>({inputs:{'cloudfunctions/study/main/index.ts':{imports:[{path:'wx-server-sdk',external:true},{path:'sharp',external:true}]},...extra}});

test('云函数打包只接受云源码、共享课程和内联zod',()=>{
 assert.doesNotThrow(()=>validateCloudInputs(metadata({'src/shared/course-catalog.ts':{},'src/content/day1.json':{},'cloud-config/client.json':{},'node_modules/zod/index.js':{}}),sourceRoot));
 for(const file of ['.env','.data/state.json','server/service.ts','cloudfunctions/study/test/login.test.ts','../private/session.json']){
  assert.throws(()=>validateCloudInputs(metadata({[file]:{}}),sourceRoot),/禁止上传/);
 }
 assert.throws(()=>validateCloudInputs({inputs:{'src/shared/course-catalog.ts':{}}},sourceRoot),/入口未打包/);
});

test('云函数禁止引入本机持久化和未声明外部依赖',()=>{
 for(const dependency of ['node:fs','node:fs/promises','node:child_process','dotenv','tsx']){
  const input=metadata({});input.inputs['cloudfunctions/study/main/index.ts'].imports.push({path:dependency,external:true});
  assert.throws(()=>validateCloudInputs(input,sourceRoot),/未经允许/);
 }
});

test('部署目录发现env、数据或额外目录会停止，保留原文件',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'wordscape-cloud-pack-'));
 for(const name of packFiles)await writeFile(join(directory,name),'generated','utf8');
 await assert.doesNotReject(validatePackDirectory(directory));
 await writeFile(join(directory,'.env'),'test-only-do-not-upload','utf8');
 await assert.rejects(validatePackDirectory(directory),/非产物文件/);
 assert.equal(await readFile(join(directory,'.env'),'utf8'),'test-only-do-not-upload');
 const other=await mkdtemp(join(tmpdir(),'wordscape-cloud-pack-data-'));await mkdir(join(other,'.data'));
 await assert.rejects(validatePackDirectory(other),/非产物文件/);
});
