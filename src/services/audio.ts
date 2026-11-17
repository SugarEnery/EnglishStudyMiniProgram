import Taro from '@tarojs/taro';
import manifest from '../content/audio.json';
import {ensureCloud} from './cloud';
import {audioLocation} from './audio-location';
import {createAudioPlayback} from './audio-playback';
import {request} from './study';
export {audioLocation} from './audio-location';
async function resolveAudio(key:string){
 const audio=(manifest as Record<string,{path:string;available:boolean}>)[key];
 if(!audio?.available)throw Error('此条英式MP3尚未制作，暂时无法播放');
 if(CLOUD_BACKEND)ensureCloud();
 const location=audioLocation(audio.path,CLOUD_BACKEND,CLOUD_STORAGE_ROOT,API_BASE);
 if(!CLOUD_BACKEND)return location;
 const result=await request<{base64:string}>('/api/audio','GET',{path:audio.path},'');
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(result.base64)||!result.base64||result.base64.length>700000)throw Error('英式音频数据格式无效');
 const name=audio.path.split('/').pop();if(!name)throw Error('音频清单路径无效');const filePath=`${Taro.env.USER_DATA_PATH}/${name}`;
 await new Promise<void>((resolve,reject)=>Taro.getFileSystemManager().writeFile({filePath,data:result.base64,encoding:'base64',success:()=>resolve(),fail:()=>reject(Error('英式音频写入本机失败'))}));
 return filePath;
}
const playback=createAudioPlayback(resolveAudio,()=>Taro.createInnerAudioContext());
export const stopAudio=playback.stop;
export const playAudio=playback.play;
