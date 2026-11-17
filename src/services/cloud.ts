import Taro from '@tarojs/taro';
import {cloudEnvironmentId} from './cloud-protocol';
let initialized=false;
export function ensureCloud(){
 if(!CLOUD_BACKEND)throw Error('当前编译使用本地HTTP服务，不能调用云开发');
 const env=cloudEnvironmentId(CLOUD_ENV_ID);
 if(initialized)return;
 if(!Taro.cloud?.init)throw Error('当前微信基础库不支持云开发，请更新微信或开发者工具');
 Taro.cloud.init({env,traceUser:false});initialized=true;
}
