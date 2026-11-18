import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildDailyCloud} from '../scripts/build-daily-cloud.mjs';

test('每日内容云函数只打包固定产物、精确依赖和凌晨三点触发器',async()=>{const result=await buildDailyCloud();assert.deepEqual(result.files,['index.cjs','index.js','package.json','config.json']);const pkg=JSON.parse(await readFile(join(result.directory,'package.json'),'utf8'));assert.match(pkg.dependencies['wx-server-sdk'],/^\d+\.\d+\.\d+$/);assert.match(pkg.dependencies['tencentcloud-sdk-nodejs-tts'],/^\d+\.\d+\.\d+$/);const config=JSON.parse(await readFile(join(result.directory,'config.json'),'utf8'));assert.deepEqual(config.triggers,[{name:'generate-next-day-at-3am',type:'timer',config:'0 0 3 * * * *'}]);});
