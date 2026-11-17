import test from 'node:test';import assert from 'node:assert/strict';
import {avatarFileData} from '../src/services/avatar-data';
const version='a'.repeat(64);
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('合法PNG Base64只写入版本哈希命名的头像文件',()=>{assert.deepEqual(avatarFileData({base64:png},version),{base64:png,fileName:`wordscape-avatar-${version}.png`});});
test('头像响应拒绝额外字段、非字符串和路径形式的版本',()=>{for(const value of [null,'bad',{base64:123},{base64:png,url:'https://example.com'}])assert.throws(()=>avatarFileData(value,version),/数据格式错误/);assert.throws(()=>avatarFileData({base64:png},'../other'),/版本无效/);});
test('头像拒绝无效Base64、非PNG和非规范padding编码',()=>{for(const text of ['',png+'!','a===','AB==','AAB='])assert.throws(()=>avatarFileData({base64:text},version),/编码无效/);assert.throws(()=>avatarFileData({base64:Buffer.from('not a PNG').toString('base64')},version),/不是PNG/);});
test('头像编码与解码长度均受512KiB上限约束',()=>{
 assert.throws(()=>avatarFileData({base64:'A'.repeat(699056)},version),/超过512KiB/);
 const oversized=Buffer.alloc(512*1024+1);oversized.set([137,80,78,71,13,10,26,10]);assert.throws(()=>avatarFileData({base64:oversized.toString('base64')},version),/超过512KiB/);
});
