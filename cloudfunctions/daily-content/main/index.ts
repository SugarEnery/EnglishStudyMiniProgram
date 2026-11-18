import cloud from 'wx-server-sdk';
import * as tencentcloud from 'tencentcloud-sdk-nodejs-tts';
import {generateDailyContent} from './generator';

const currentEnvironment={env:cloud.DYNAMIC_CURRENT_ENV,timeout:120000} as unknown as Parameters<typeof cloud.init>[0];
cloud.init(currentEnvironment);
const database=cloud.database({throwOnNotFound:false} as never);
const collection='daily_sentences';
const model=process.env.DAILY_AI_MODEL||'hy4';
const voiceType=Number(process.env.DAILY_TTS_VOICE_TYPE||101050);
if(model!=='hy4')throw Error('每日生文模型配置必须为hy4');
if(!Number.isInteger(voiceType)||voiceType<=0)throw Error('每日语音音色配置无效');

function shanghaiDate(offsetDays:number){
 const date=new Date(Date.now()+offsetDays*86400000);const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');
}
function credentials(){
 const secretId=process.env.DAILY_TTS_SECRET_ID,secretKey=process.env.DAILY_TTS_SECRET_KEY;
 if(!secretId||!secretKey)throw Error('请配置语音合成专用密钥 DAILY_TTS_SECRET_ID 和 DAILY_TTS_SECRET_KEY');
 return {secretId,secretKey};
}
const TtsClient=tencentcloud.tts.v20190823.Client;
type Row=Record<string,unknown>;
type NativeDoc={get:()=>Promise<{data:Row|null}>;set:(input:{data:Row})=>Promise<unknown>};
type NativeTransaction={collection:(name:string)=>{doc:(id:string)=>NativeDoc}};
const runTransaction=<T>(action:(transaction:NativeTransaction)=>Promise<T>)=>database.runTransaction(action as never) as Promise<T>;

function dependencies(){return {
 model,voiceType,now:Date.now,
 claim:async(date:string)=>runTransaction(async transaction=>{
  const ref=transaction.collection(collection).doc(date);const result=await ref.get();const row=result.data as Record<string,unknown>|null;
  if(row?.status==='published')return 'published' as const;
  if(row?.status==='generating'&&typeof row.startedAt==='number'&&Date.now()-row.startedAt<15*60*1000)return 'busy' as const;
  await ref.set({data:{date,status:'generating',startedAt:Date.now()}});return 'claimed' as const;
 }),
 recentEnglish:async()=>{const result=await database.collection(collection).where({status:'published'}).limit(30).get() as unknown as {data:Row[]};return result.data.map(row=>row.english).filter((value):value is string=>typeof value==='string');},
 generateText:async(prompt:string)=>{
  const ai=(cloud as unknown as {ai:()=>{createModel:(provider:string)=>{generateText:(input:{model:string;messages:{role:'user';content:string}[]})=>Promise<{text?:string}>}}}).ai();
  const result=await ai.createModel('cloudbase').generateText({model,messages:[{role:'user',content:prompt}]});if(typeof result.text!=='string'||!result.text)throw Error('生文模型没有返回文本');return result.text;
 },
 synthesize:async(english:string,date:string)=>{
  const client=new TtsClient({credential:credentials(),region:'ap-shanghai',profile:{httpProfile:{endpoint:'tts.tencentcloudapi.com'}}});
  const result=await client.TextToVoice({Text:english,SessionId:`wordscape-${date}-${Date.now()}`,VoiceType:voiceType,PrimaryLanguage:2,SampleRate:16000,Codec:'mp3',Speed:-1});
  if(typeof result.Audio!=='string'||!result.Audio||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(result.Audio))throw Error('语音合成没有返回有效音频');return Buffer.from(result.Audio,'base64');
 },
 upload:async(path:string,bytes:Buffer)=>{const result=await cloud.uploadFile({cloudPath:path,fileContent:bytes});if(!result.fileID)throw Error('每日音频上传失败');return result.fileID;},
 publish:async(date:string,row:Record<string,unknown>)=>runTransaction(async transaction=>{const ref=transaction.collection(collection).doc(date);const existing=await ref.get();if(existing.data?.status!=='generating')throw Error('每日内容生成锁已失效');await ref.set({data:row});}),
 fail:async(date:string,message:string)=>runTransaction(async transaction=>{const ref=transaction.collection(collection).doc(date);const existing=await ref.get();if(existing.data?.status==='published')return;await ref.set({data:{date,status:'failed',failedAt:Date.now(),error:message}});}),
};}

export async function main(){
 const outcomes:Record<string,string>={},errors:string[]=[];
 for(const date of [shanghaiDate(0),shanghaiDate(1)])try{outcomes[date]=await generateDailyContent(date,dependencies());}catch(error){const message=error instanceof Error?error.message:'生成失败';outcomes[date]='failed';errors.push(`${date}:${message}`);cloud.logger().error({message:'每日内容生成失败',date,detail:message});}
 if(errors.length)throw Error(errors.join('; '));return {ok:true,outcomes};
}
