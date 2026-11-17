// 微信调用时自动注入的平台元数据不属于业务请求；身份始终从服务端SDK获取。
export function businessEvent(event:unknown):unknown{
 if(event===null||typeof event!=='object'||Array.isArray(event))return event;
 const {tcbContext,userInfo,...request}=event as Record<string,unknown>;
 return request;
}
