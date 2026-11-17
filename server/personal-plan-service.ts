import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {z} from 'zod';
import {personalPlanSchema,createPersonalPlanSchema,updatePersonalPlanSchema,type PersonalPlan} from '../src/shared/personal-plan';
import {today} from '../src/shared/daily-plan';
import {ApiError} from './service';

const plansSchema=z.object({version:z.literal(1),users:z.record(z.string().regex(/^[a-f0-9]{64}$/),personalPlanSchema)}).strict();
type Plans=z.infer<typeof plansSchema>;
export class PersonalPlanService{
 private queue:Promise<unknown>=Promise.resolve();
 constructor(private file:string){}
 private async load():Promise<Plans>{
  try{return plansSchema.parse(JSON.parse(await readFile(this.file,'utf8')));}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {version:1,users:{}};if(error instanceof z.ZodError)throw new Error('个人计划持久文件结构损坏');throw error;}
 }
 private transaction<T>(action:(state:Plans)=>T,write=false):Promise<T>{
  const run=this.queue.then(async()=>{
   const state=await this.load();const result=action(state);
   if(write){await mkdir(dirname(this.file),{recursive:true,mode:0o700});const temporary=`${this.file}.${randomBytes(8).toString('hex')}.tmp`;await writeFile(temporary,JSON.stringify(state),{encoding:'utf8',mode:0o600});await rename(temporary,this.file);}
   return result;
  });this.queue=run.then(()=>undefined,()=>undefined);return run;
 }
 private checkAccount(account:string){if(!/^[a-f0-9]{64}$/.test(account))throw Error('服务器账号标识无效');}
 get(account:string):Promise<PersonalPlan|null>{this.checkAccount(account);return this.transaction(state=>state.users[account]??null);}
 create(account:string,input:unknown):Promise<PersonalPlan>{
  this.checkAccount(account);const request=createPersonalPlanSchema.parse(input);
  if(request.startedOn&&request.startedOn>today())throw new ApiError(400,'计划开始日期不能晚于今天');
  return this.transaction(state=>{
   const existing=state.users[account];
   if(existing){
    if(existing.id!==request.id)throw new ApiError(409,'个人计划已开始，不能重复创建，请刷新查看现有计划');
    if(existing.wordsPerDay!==request.wordsPerDay)throw new ApiError(409,'此计划编号已使用其他每日词数');
    if(request.startedOn&&existing.startedOn!==request.startedOn)throw new ApiError(409,'此计划编号已使用其他开始日期');
    return existing;
   }
   const plan=personalPlanSchema.parse({...request,startedOn:request.startedOn??today(),version:'personal-v1'});state.users[account]=plan;return plan;
  },true);
 }
 update(account:string,input:unknown):Promise<PersonalPlan>{
  this.checkAccount(account);const request=updatePersonalPlanSchema.parse(input);
  if(request.startedOn>today())throw new ApiError(400,'计划开始日期不能晚于今天');
  return this.transaction(state=>{
   const existing=state.users[account];if(!existing||existing.id!==request.id)throw new ApiError(409,'原学习计划不存在或编号不一致');
   const updated=personalPlanSchema.parse({...existing,...request});state.users[account]=updated;return updated;
  },true);
 }
}
