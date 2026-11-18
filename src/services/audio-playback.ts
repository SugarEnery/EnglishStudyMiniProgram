export type AudioPlayer={src:string;stop:()=>void;destroy:()=>void;play:()=>void;onError:(callback:()=>void)=>void;onEnded:(callback:()=>void)=>void};
/** 音频下载或地址解析完成后，只有最后一次仍有效的播放请求可以发声。 */
export function createAudioPlayback(resolve:(key:string)=>Promise<string>,createPlayer:()=>AudioPlayer){
 let player:AudioPlayer|undefined;let playingChange:((playing:boolean)=>void)|undefined;let generation=0;
 function stop(){generation++;const previous=player;const notify=playingChange;player=undefined;playingChange=undefined;if(previous){previous.stop();previous.destroy();}notify?.(false);}
 function play(key:string,onError:(message:string)=>void,onPlayingChange?:(playing:boolean)=>void){
  stop();const attempt=generation;
  void resolve(key).then(url=>{
   if(generation!==attempt)return;
   const current=createPlayer();player=current;playingChange=onPlayingChange;
   current.onError(()=>{if(player!==current)return;stop();onError('英式音频加载失败，请检查音频服务');});
   current.onEnded(()=>{if(player===current)stop();});current.src=url;current.play();onPlayingChange?.(true);
  }).catch(error=>{if(generation!==attempt)return;stop();onError(error instanceof Error?error.message:'英式音频读取失败');});
 }
 return {stop,play};
}
