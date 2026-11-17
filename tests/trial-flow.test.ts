import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=(path:string)=>readFile(new URL(path,import.meta.url),'utf8');

test('未登录学习页先显示一次性三天试学开屏',async()=>{
 const source=await read('../src/pages/index/index.tsx');
 assert.match(source,/wordscape:trial-intro:v1/);
 assert.match(source,/开始三天试学/);
 assert.match(source,/account\.days\.slice\(0,3\)/);
 assert.match(source,/mode==='local'\?`试学第/);
});

test('试学不冒充正式个人计划，微信账号仍严格匹配计划课程',async()=>{
 const page=await read('../src/pages/index/index.tsx');
 const session=await read('../src/shared/session-controller.ts');
 assert.match(page,/mode==='wechat'&&account\.plan/);
 assert.match(session,/saved\.mode==='wechat'&&snapshot\.plan/);
 assert.doesNotMatch(page,/startPlan\(/);
});
