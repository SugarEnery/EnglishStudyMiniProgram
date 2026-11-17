import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessEvent} from '../main/platform-event';
test('只剥离微信注入元数据，业务参数和未知字段保留给严格校验',()=>{
 const request={path:'/api/session',method:'POST',data:{},token:'',unexpected:true};
 assert.deepEqual(businessEvent({...request,tcbContext:{},userInfo:{openId:'untrusted'}}),request);
 for(const invalid of [null,[],false,'invalid'])assert.equal(businessEvent(invalid),invalid);
});
