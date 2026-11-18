import {createHash} from 'node:crypto';
import {validateGeneratedDailyText,type DailyContent} from '../../../src/shared/daily-content';

export type PublishedDailyContent=DailyContent&{audioFileID:string;contentHash:string;status:'published';generatedAt:number;model:string;voiceType:number};
export type GeneratorDependencies={
 claim:(date:string)=>Promise<'claimed'|'published'|'busy'>;
 recentEnglish:()=>Promise<string[]>;
 generateText:(prompt:string)=>Promise<string>;
 synthesize:(english:string,date:string)=>Promise<Buffer>;
 upload:(path:string,bytes:Buffer)=>Promise<string>;
 publish:(date:string,row:PublishedDailyContent)=>Promise<void>;
 fail:(date:string,message:string)=>Promise<void>;
 now:()=>number;
 model:string;
 voiceType:number;
};

function parseModelJson(text:string){
 if(text.trim()!==text||text.startsWith('```')||text.endsWith('```'))throw Error('生文模型未返回纯JSON');
 let value:unknown;try{value=JSON.parse(text);}catch{throw Error('生文模型返回的JSON无效');}
 return validateGeneratedDailyText(value);
}

function mp3(bytes:Buffer){return bytes.length>=128&&bytes.length<=512*1024&&(bytes.subarray(0,3).toString('ascii')==='ID3'||(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0));}
export function promptFor(date:string,recent:string[]){return `为英语学习小程序生成${date}的每日短文。只返回一个JSON对象，不要Markdown，不要解释，字段必须且只能是english和chinese。english写1至3句自然、积极、适合日常学习的原创英文，共12至50个英文单词；chinese是准确完整的中文译文并以中文标点结尾。不得复用以下近期内容：${JSON.stringify(recent.slice(0,30))}`;}

export async function generateDailyContent(date:string,deps:GeneratorDependencies){
 const state=await deps.claim(date);if(state!=='claimed')return state;
 try{
  const recent=await deps.recentEnglish();const content=parseModelJson(await deps.generateText(promptFor(date,recent)));
  const contentHash=createHash('sha256').update(content.english).digest('hex');
  if(recent.some(value=>createHash('sha256').update(value).digest('hex')===contentHash))throw Error('生文模型生成了重复内容');
  const audio=await deps.synthesize(content.english,date);if(!mp3(audio))throw Error('语音合成返回的MP3无效');
  const audioVersion=createHash('sha256').update(audio).digest('hex');const audioFileID=await deps.upload(`daily-sentences/${date}/${audioVersion}.mp3`,audio);
  if(!audioFileID.startsWith('cloud://'))throw Error('云存储未返回有效音频标识');
  const row:PublishedDailyContent={date,...content,audioVersion,audioFileID,contentHash,status:'published',generatedAt:deps.now(),model:deps.model,voiceType:deps.voiceType};
  await deps.publish(date,row);return 'published' as const;
 }catch(error){const message=error instanceof Error?error.message:'每日内容生成失败';await deps.fail(date,message.slice(0,160));throw error;}
}
