import {createHash,randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import sharp from 'sharp';
import {z} from 'zod';
import {profileUpdateSchema} from '../src/shared/profile-schema';
import type {AccountProfile} from '../src/shared/profile-types';
import {ApiError} from './service';

const storedProfile=z.object({nickName:z.string().max(40),avatarVersion:z.string().regex(/^[a-f0-9]{64}$/).nullable()}).strict();
const profilesSchema=z.object({version:z.literal(1),users:z.record(z.string().regex(/^[a-f0-9]{64}$/),storedProfile)}).strict();
type Profiles=z.infer<typeof profilesSchema>;
const uploadSchema=z.object({base64:z.string().min(1)}).strict();
const userIdFor=(account:string)=>`WS-${createHash('sha256').update(`wordscape-user-id:v1:${account}`).digest('hex').slice(0,16).toUpperCase()}`;
export class ProfileService{
 private queue:Promise<unknown>=Promise.resolve();
 constructor(private file:string){}
 private async load():Promise<Profiles>{
  try{return profilesSchema.parse(JSON.parse(await readFile(this.file,'utf8')));}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {version:1,users:{}};if(error instanceof z.ZodError)throw new Error('个人资料持久文件结构损坏');throw error;}
 }
 private transaction<T>(action:(state:Profiles)=>Promise<T>|T,write=false):Promise<T>{
  const run=this.queue.then(async()=>{
   const state=await this.load();const result=await action(state);
   if(write){await mkdir(dirname(this.file),{recursive:true,mode:0o700});const temporary=`${this.file}.${randomBytes(8).toString('hex')}.tmp`;await writeFile(temporary,JSON.stringify(state),{encoding:'utf8',mode:0o600});await rename(temporary,this.file);}
   return result;
  });this.queue=run.then(()=>undefined,()=>undefined);return run;
 }
 private checkAccount(account:string){if(!/^[a-f0-9]{64}$/.test(account))throw Error('服务器账号标识无效');}
 private publicProfile(account:string,value:z.infer<typeof storedProfile>|undefined):AccountProfile{return {userId:userIdFor(account),nickName:value?.nickName??'',hasAvatar:Boolean(value?.avatarVersion),avatarVersion:value?.avatarVersion??null};}
 private avatarPath(account:string,version:string){return resolve(dirname(this.file),'avatars',`${account}-${version}.png`);}
 get(account:string){this.checkAccount(account);return this.transaction(state=>this.publicProfile(account,state.users[account]));}
 patch(account:string,input:unknown){
  this.checkAccount(account);const update=profileUpdateSchema.parse(input);
  return this.transaction(state=>{const profile={nickName:update.nickName,avatarVersion:state.users[account]?.avatarVersion??null};state.users[account]=profile;return this.publicProfile(account,profile);},true);
 }
 async putAvatar(account:string,input:unknown){
  this.checkAccount(account);const {base64}=uploadSchema.parse(input);
  if(base64.length>699052)throw new ApiError(413,'头像不能超过512KiB');
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))throw new ApiError(400,'头像编码无效');
  const source=Buffer.from(base64,'base64');
  if(source.length>512*1024)throw new ApiError(413,'头像不能超过512KiB');
  if(source.toString('base64')!==base64)throw new ApiError(400,'头像编码无效');
  const png=source.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const jpeg=source[0]===255&&source[1]===216&&source[2]===255;
  if(!png&&!jpeg)throw new ApiError(415,'头像仅支持真实JPEG或PNG图片');
  return this.transaction(async state=>{
   let normalized:Buffer;
   try{
    const image=sharp(source,{limitInputPixels:4096*4096,failOn:'warning'});
    const metadata=await image.metadata();
    if(!['png','jpeg'].includes(metadata.format??'')||!metadata.width||!metadata.height||metadata.width>4096||metadata.height>4096||(metadata.pages??1)!==1)throw Error('图片尺寸或格式无效');
    normalized=await image.rotate().resize(256,256,{fit:'cover'}).png().toBuffer();
   }catch{throw new ApiError(422,'头像图片损坏或尺寸超过4096×4096');}
   const version=createHash('sha256').update(normalized).digest('hex');
   const avatar=this.avatarPath(account,version);await mkdir(dirname(avatar),{recursive:true,mode:0o700});
   const temporary=`${avatar}.${randomBytes(8).toString('hex')}.tmp`;await writeFile(temporary,normalized,{mode:0o600});await rename(temporary,avatar);
   const profile={nickName:state.users[account]?.nickName??'',avatarVersion:version};state.users[account]=profile;return this.publicProfile(account,profile);
  },true);
 }
 avatar(account:string){
  this.checkAccount(account);return this.transaction(async state=>{
   const version=state.users[account]?.avatarVersion;if(!version)throw new ApiError(404,'尚未设置头像');
   try{return await readFile(this.avatarPath(account,version));}
   catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new ApiError(404,'头像文件缺失，请重新上传');throw error;}
  });
 }
}
