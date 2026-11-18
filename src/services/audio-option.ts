export type SetInnerAudioOption=(option:{obeyMuteSwitch:false})=>Promise<unknown>;

/** 仅真机 iOS 需要关闭静音开关限制；开发工具和其他平台不调用该接口。 */
export function createAudioOptionSetup(readPlatform:()=>string,setOption:SetInnerAudioOption){
 let pending:Promise<void>|undefined;
 return function ensureAudioOption(){
  if(readPlatform()!=='ios')return Promise.resolve();
  if(!pending)pending=setOption({obeyMuteSwitch:false}).then(()=>undefined).catch(()=>{pending=undefined;throw Error('无法启用iPhone静音模式音频播放');});
  return pending;
 };
}
