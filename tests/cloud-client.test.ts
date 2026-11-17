import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudEnvironmentId,sessionStorageKey,responseData,readCloudEvents,SessionExpiredError} from '../src/services/cloud-protocol';
import {audioLocation} from '../src/services/audio-location';
import {createAudioPlayback,type AudioPlayer} from '../src/services/audio-playback';
const event=(index:number)=>({id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`,day:1,lessonId:'oxford-1-301',type:'read',createdAt:'2026-11-06T01:00:00.000Z'});
test('缺少云环境明确失败，会话按环境和后端隔离',()=>{
 assert.throws(()=>cloudEnvironmentId(''),/尚未配置云开发环境/);assert.throws(()=>cloudEnvironmentId(' env '),/首尾空格/);assert.equal(cloudEnvironmentId('env-1'),'env-1');
 const cloud=sessionStorageKey(true,'env-1','http://127.0.0.1:8788');assert.notEqual(cloud,sessionStorageKey(false,'env-1','http://127.0.0.1:8788'));assert.notEqual(cloud,sessionStorageKey(true,'env-2','http://127.0.0.1:8788'));assert.notEqual(cloud,'wordscape:session:v1');
});
test('云函数401保留会话失效类型，损坏响应立即拒绝',()=>{
 assert.throws(()=>responseData({statusCode:401,data:{error:'expired'}}),SessionExpiredError);for(const response of [undefined,'oops',{statusCode:'200',data:{}},{statusCode:200}])assert.throws(()=>responseData(response),/响应格式错误/);
 assert.throws(()=>responseData({statusCode:503,data:{error:'尚未部署'}}),/尚未部署/);assert.deepEqual(responseData({statusCode:200,data:{ok:true}}),{ok:true});
});
test('事件分页保持服务器顺序，直到null才结束',async()=>{
 const cursors:(string|undefined)[]=[];const result=await readCloudEvents(async cursor=>{cursors.push(cursor);return cursor?{events:[event(2)],nextCursor:null}:{events:[event(1)],nextCursor:'next-page'};});assert.deepEqual(cursors,[undefined,'next-page']);assert.deepEqual(result.map(item=>item.id),[event(1).id,event(2).id]);
});
test('重复游标、重复事件和空的未完成分页明确拒绝',async()=>{
 let page=0;await assert.rejects(readCloudEvents(async()=>({events:[event(++page)],nextCursor:'same'})),/游标无效/);page=0;await assert.rejects(readCloudEvents(async()=>({events:[event(1)],nextCursor:page++?'second':'first'})),/分页重复/);await assert.rejects(readCloudEvents(async()=>({events:[],nextCursor:'next'})),/游标无效/);await assert.rejects(readCloudEvents(async()=>({events:[event(1)]})),/分页格式错误/);
});
test('超过十万条记录明确失败，不截断返回',async()=>{
 let index=0;
 await assert.rejects(readCloudEvents(async()=>{
  const size=index===100000?1:100;const events=Array.from({length:size},()=>event(++index));
  return {events,nextCursor:index>100000?null:String(index)};
 }),/超过100000条/);
});
test('音频只能映射真实配置的云根，缺失不会变成HTTP',()=>{
 const path='/audio/en-GB/v1/'+'a'.repeat(64)+'.mp3';assert.equal(audioLocation(path,true,'cloud://actual-env.actual-bucket','http://local'),'cloud://actual-env.actual-bucket'+path);assert.equal(audioLocation(path,false,'','http://local'),'http://local'+path);assert.throws(()=>audioLocation(path,true,'','http://local'),/尚未配置音频云存储/);assert.throws(()=>audioLocation(path,true,'https://files.example',''),/根目录无效/);assert.throws(()=>audioLocation('/audio/../secret',true,'cloud://env.bucket',''),/清单路径无效/);
});
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
function player(log:string[]):AudioPlayer{return {src:'',stop:()=>log.push('stop'),destroy:()=>log.push('destroy'),play:()=>log.push('play'),onError:()=>{},onEnded:()=>{}};}
test('等待音频文件时停止，旧结果返回后不会发声或再报旧错',async()=>{
 let finish!:(value:string)=>void;const log:string[]=[];const errors:string[]=[];const playback=createAudioPlayback(()=>new Promise(resolve=>{finish=resolve;}),()=>player(log));playback.play('old',message=>errors.push(message));playback.stop();finish('https://audio.example/old.mp3');await tick();assert.deepEqual(log,[]);assert.deepEqual(errors,[]);
});
test('连续播放只保留最后一次，当前真实错误仍上报',async()=>{
 const pending=new Map<string,(value:string)=>void>();const log:string[]=[];const errors:string[]=[];const playback=createAudioPlayback(key=>key==='broken'?Promise.reject(Error('文件缺失')):new Promise(resolve=>pending.set(key,resolve)),()=>player(log));playback.play('first',message=>errors.push(message));playback.play('second',message=>errors.push(message));pending.get('second')!('https://audio.example/second.mp3');pending.get('first')!('https://audio.example/first.mp3');await tick();assert.deepEqual(log,['play']);playback.play('broken',message=>errors.push(message));await tick();assert.deepEqual(log,['play','stop','destroy']);assert.deepEqual(errors,['文件缺失']);
});
