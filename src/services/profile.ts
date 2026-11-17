import Taro from '@tarojs/taro';
import {request,SessionExpiredError} from './study';
import {accountProfileSchema,profileUpdateSchema} from '../shared/profile-schema';
import type {ProfileView} from '../shared/session-controller';
import {avatarFileData} from './avatar-data';
export async function loadProfile(token:string):Promise<ProfileView>{
 const profile=accountProfileSchema.parse(await request('/api/profile','GET',undefined,token));
 let avatarPath='';
 if(profile.hasAvatar){
  if(CLOUD_BACKEND){
   const file=avatarFileData(await request('/api/profile/avatar','GET',undefined,token),profile.avatarVersion);
   const directory=Taro.env?.USER_DATA_PATH;if(!directory)throw Error('当前微信环境不支持保存头像，请更新微信或开发者工具');
   const filePath=directory+'/'+file.fileName;
   await new Promise<void>((resolve,reject)=>Taro.getFileSystemManager().writeFile({filePath,data:file.base64,encoding:'base64',success:()=>resolve(),fail:()=>reject(Error('头像保存到本机失败，请检查本机存储空间后刷新'))}));
   avatarPath=filePath;
  }else{
   const result=await Taro.downloadFile({url:API_BASE+'/api/profile/avatar',header:{Authorization:`Bearer ${token}`}}).catch(()=>{throw Error('头像读取失败，请检查网络后刷新');});
   if(result.statusCode===401)throw new SessionExpiredError();
   if(result.statusCode!==200||!result.tempFilePath)throw Error('头像读取失败，请刷新重试');
   avatarPath=result.tempFilePath;
  }
 }
 return {profile,avatarPath};
}
export async function updateProfile(token:string,nickName:string){
 const input=profileUpdateSchema.safeParse({nickName});if(!input.success)throw Error('昵称需填写1至40个字');
 await request('/api/profile','POST',input.data,token);return loadProfile(token);
}
export async function uploadAvatar(token:string,path:string){
 const manager=Taro.getFileSystemManager();
 const file=await new Promise<{data:string|ArrayBuffer}>((resolve,reject)=>manager.readFile({filePath:path,encoding:'base64',success:resolve,fail:()=>reject(Error('无法读取选择的头像，请重新选择'))}));
 if(typeof file.data!=='string')throw Error('头像文件格式错误');
 await request('/api/profile/avatar','PUT',{base64:file.data},token);return loadProfile(token);
}
