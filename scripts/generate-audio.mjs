import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,mkdtemp,rename,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import {inspectMp3} from './verify-audio.mjs';
const run=promisify(execFile);
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await readFile(join(root,'src/content/audio.json'),'utf8'));
const voice='Daniel';
const incremental=process.argv.includes('--missing');
if(process.argv.slice(2).some(argument=>argument!=='--missing'))throw Error('仅支持--missing增量生成参数');
// 固定英式声线，不在声线缺失时替换成其他口音。
const {stdout:voices}=await run('/usr/bin/say',['-v','?']);
if(!/^Daniel\s+en_GB\s/m.test(voices))throw Error('缺少Daniel英式声线，已停止生成');
const temporary=await mkdtemp(join(tmpdir(),'wordscape-british-audio-'));
const reportFile=join(root,'docs/audio-verification.json');
const report=incremental?JSON.parse(await readFile(reportFile,'utf8')):{version:1,engine:'macOS say',voice:'com.apple.voice.compact.en-GB.Daniel',locale:'en-GB',codec:'MP3/libmp3lame',sampleRate:44100,generatedAt:new Date().toISOString(),entries:{}};
if(incremental&&(report.voice!=='com.apple.voice.compact.en-GB.Daniel'||report.locale!=='en-GB'||Object.keys(report.entries).some(key=>!manifest[key])))throw Error('旧音频报告与当前课程或声线不一致');
async function saveReport(){report.updatedAt=new Date().toISOString();const file=reportFile+'.tmp';await writeFile(file,JSON.stringify(report,null,2)+'\n','utf8');await rename(file,reportFile);}
let count=0,generated=0,retained=0;
for(const [key,item] of Object.entries(manifest)){
 const expected='/audio/en-GB/v1/'+createHash('sha256').update('en-GB|v1|'+item.text).digest('hex')+'.mp3';
 if(item.path!==expected)throw Error('音频路径与原文不一致：'+key);
 const destination=resolve(root,'.'+item.path);
 let exists=false;try{await stat(destination);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(exists){
  if(!incremental)throw Error('音频已存在，请先核对，禁止自动覆盖：'+key);
  const previous=report.entries[key];const hash=createHash('sha256').update(await readFile(destination)).digest('hex');
  if(!previous||previous.text!==item.text||previous.path!==item.path||previous.sha256!==hash)throw Error('原音频缺少有效校验记录，禁止跳过或覆盖：'+key);
  count++;retained++;continue;
 }
 const basename=String(count).padStart(3,'0');
 const wav=join(temporary,basename+'.wav'),mp3=join(temporary,basename+'.mp3');
 const rate=key.startsWith('paragraph:')?175:165;
 // 始终使用清单原文；不替换单词、不剪切句子、不猜测读音。
 await run('/usr/bin/say',['-v',voice,'-r',String(rate),'--file-format=WAVE','--data-format=LEI16@44100','-o',wav,item.text]);
 await run(ffmpeg.path,['-nostdin','-v','error','-xerror','-i',wav,'-codec:a','libmp3lame','-q:a','3','-ar','44100','-ac','1','-map_metadata','-1',mp3]);
 const decoded=await inspectMp3(mp3);
 const {stdout:original}=await run(ffmpeg.path,['-nostdin','-v','error','-i',wav,'-ar','44100','-ac','1','-f','s16le','pipe:1'],{encoding:'buffer',maxBuffer:32*1024*1024});
 const sourceFrames=original.length/2,paddingFrames=decoded.frames-sourceFrames;
 // MPEG-1 Layer III每帧1152个样本；解码允许末帧填充，不剪切或补齐语音。
 if(paddingFrames<0||paddingFrames>=1152)throw Error('解码长度超出MP3帧边界：'+key);
 await mkdir(dirname(destination),{recursive:true});await rename(mp3,destination);
 report.entries[key]={path:item.path,text:item.text,wordsPerMinute:rate,sourceFrames,paddingFrames,...decoded};
 await saveReport();generated++;count++;if(generated%20===0||count===Object.keys(manifest).length)console.log(`已新增并解码验证 ${generated} 条；已保留 ${retained} 条`);
}
await saveReport();
console.log('音频生成完成；临时原始WAV保存在 '+temporary);
