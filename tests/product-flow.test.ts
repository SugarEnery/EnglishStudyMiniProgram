import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=(path:string)=>readFile(new URL(path,import.meta.url),'utf8');

test('计划页要求微信登录并在原页面打开登录弹窗',async()=>{
 const source=await read('../src/pages/plan/index.tsx');
 assert.match(source,/state\.mode!=='wechat'/);
 assert.match(source,/微信登录并开始计划/);
 assert.match(source,/AccountSheet mode='login'/);
 assert.doesNotMatch(source,/计划保存在本机/);
});

test('登录和头像昵称编辑分开，登录成功不强制进入资料编辑',async()=>{
 const source=await read('../src/components/AccountSheet.tsx');
 assert.match(source,/title:'登录成功'/);
 assert.match(source,/setOpen\(false\)/);
 assert.match(source,/mode==='profile'/);
 assert.match(source,/头像和昵称是可选资料/);
 assert.doesNotMatch(source,/setProfileMode/);
});

test('计划保存、修改影响和每日课程状态均有明确反馈',async()=>{
 const source=await read('../src/pages/plan/index.tsx');
 assert.match(source,/已有学习记录会保留，但不计入新计划进度/);
 assert.match(source,/开始第1天学习/);
 assert.match(source,/可学习/);
 assert.match(source,/待生成/);
 assert.match(source,/状态读取失败/);
});
