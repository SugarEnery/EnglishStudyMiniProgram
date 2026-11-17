import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
const run=promisify(execFile);
export async function inspectMp3(file){
 const bytes=await readFile(file);
 let offset=0;
 if(bytes.subarray(0,3).toString('ascii')==='ID3'){
  if(bytes.length<10||bytes.subarray(6,10).some(b=>b&128))throw Error('ID3头无效：'+file);
  offset=10+((bytes[6]<<21)|(bytes[7]<<14)|(bytes[8]<<7)|bytes[9])+((bytes[5]&16)?10:0);
 }
 const header=bytes.subarray(offset,offset+4);
 if(header.length!==4||header[0]!==255||(header[1]&224)!==224||((header[1]>>3)&3)!==3||((header[1]>>1)&3)!==1||((header[2]>>2)&3)!==0||(header[3]>>6)!==3)throw Error('必须是44100Hz单声道MPEG-1 Layer III文件：'+file);

 const {stdout,stderr}=await run(ffmpeg.path,['-nostdin','-v','error','-xerror','-err_detect','explode','-i',file,'-ar','44100','-ac','1','-f','s16le','pipe:1'],{encoding:'buffer',maxBuffer:32*1024*1024});
 if(stderr.length||stdout.length===0||stdout.length%2)throw Error('音频无法完整解码：'+file);
 let nonzero=false;for(let i=0;i<stdout.length;i+=2)if(stdout.readInt16LE(i)!==0){nonzero=true;break;}
 if(!nonzero)throw Error('音频只有静音：'+file);
 return {sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,frames:stdout.length/2,durationSeconds:stdout.length/2/44100};
}
export async function verifyAudio({decode=true}={}){
 const root=fileURLToPath(new URL('../',import.meta.url));
 const manifest=JSON.parse(await readFile(resolve(root,'src/content/audio.json'),'utf8'));
 const report=JSON.parse(await readFile(resolve(root,'docs/audio-verification.json'),'utf8'));
 if(JSON.stringify(Object.keys(manifest).sort())!==JSON.stringify(Object.keys(report.entries).sort()))throw Error('音频校验报告未覆盖全部课程');
 let count=0;
 for(const [key,item] of Object.entries(manifest)){
  if(!item.available)throw Error('音频清单仍标记缺失：'+key);
  const record=report.entries[key],file=resolve(root,'.'+item.path);
  const expected='/audio/en-GB/v1/'+createHash('sha256').update('en-GB|v1|'+item.text).digest('hex')+'.mp3';
  if(item.path!==expected||record.path!==item.path||record.text!==item.text)throw Error('音频原文或路径不一致：'+key);
  const digest=createHash('sha256').update(await readFile(file)).digest('hex');
  if(digest!==record.sha256||!(record.frames>0)||!(record.durationSeconds>0)||record.paddingFrames!==record.frames-record.sourceFrames||record.paddingFrames<0||record.paddingFrames>=1152)throw Error('音频文件与解码记录不符：'+key);
  if(decode){const actual=await inspectMp3(file);if(actual.frames!==record.frames||actual.sha256!==record.sha256)throw Error('音频解码检查不一致：'+key);}
  count++;
 }
 console.log(`音频检查：${count}通过，0失败${decode?'（全部真实解码）':'（文件完整性）'}`);return count;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await verifyAudio({decode:!process.argv.includes('--integrity')});
