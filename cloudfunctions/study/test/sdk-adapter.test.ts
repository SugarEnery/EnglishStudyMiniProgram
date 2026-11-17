import test from 'node:test';
import assert from 'node:assert/strict';
import cloud from 'wx-server-sdk';
import {createRepository,collections,type NativeDatabase} from '../main/repository';

test('真实SDK4包装层缺失文档返回null，异常仍拒绝，remove兼容事务delete',async()=>{
 // 测试只替换SDK内部事务传输层，不调用任何线上数据库；DocumentReference包装仍使用真实SDK。
 cloud.init({env:'offline-sdk-test-environment'});
 const options:NonNullable<Parameters<typeof cloud.database>[0]>&{throwOnNotFound:false}={throwOnNotFound:false};const database=cloud.database(options);let fail=false;let deleted=0;
 const native={collection:()=>({doc:()=>({
  get:async()=>{if(fail)throw Error('测试权限或网络错误');return {data:null};},
  delete:async()=>{deleted++;return {deleted:1};},
 })})};
 Object.assign(database,{_db:{runTransaction:async<T>(action:(tx:typeof native)=>Promise<T>)=>action(native)}});
 const repository=createRepository(database as unknown as NativeDatabase);
 assert.equal(await repository.transaction(tx=>tx.get(collections.sessions,'not-found')),null);
 await repository.transaction(tx=>tx.remove(collections.sessions,'existing'));assert.equal(deleted,1);
 fail=true;await assert.rejects(repository.transaction(tx=>tx.get(collections.sessions,'not-found')));
});
