import sharp from 'sharp';
import {CloudError} from './errors';
export async function normalizeAvatar(base64:string){
 if(base64.length>699052)throw new CloudError(413,'头像不能超过512KiB');
 if(!base64||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))throw new CloudError(400,'头像编码无效');
 const source=Buffer.from(base64,'base64');if(source.length>512*1024)throw new CloudError(413,'头像不能超过512KiB');
 if(source.toString('base64')!==base64)throw new CloudError(400,'头像编码无效');
 if(!source.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&!(source[0]===255&&source[1]===216&&source[2]===255))throw new CloudError(415,'头像仅支持JPEG或PNG');
 try{
  const image=sharp(source,{limitInputPixels:4096*4096,failOn:'warning'});const metadata=await image.metadata();
  if(!metadata.width||!metadata.height||metadata.width>4096||metadata.height>4096||(metadata.pages??1)!==1||!['png','jpeg'].includes(metadata.format??''))throw Error('图片无效');
  return await image.rotate().resize(256,256,{fit:'cover'}).png().toBuffer();
 }catch{throw new CloudError(422,'头像损坏或尺寸超过4096×4096');}
}
export async function validateStoredAvatar(bytes:Buffer){
 if(bytes.length>512*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('云存储头像无效');
 try{const image=sharp(bytes,{limitInputPixels:256*256,failOn:'warning'});const metadata=await image.metadata();if(metadata.format!=='png'||metadata.width!==256||metadata.height!==256||(metadata.pages??1)!==1)throw Error('云存储头像尺寸无效');await image.raw().toBuffer();}catch{throw Error('云存储头像损坏');}
}
