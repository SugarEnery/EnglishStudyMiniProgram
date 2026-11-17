import {dailyWordCountSchema,personalPlanSchema,type PersonalPlan} from './personal-plan';
import type {AccountProfile} from './profile-types';
export type ProfileView={profile:AccountProfile;avatarPath:string};
import type {DailyBatch} from './daily-types';
import type {DaySummary,EventInput,SessionResponse,StudyEvent} from './study-types';
import {z} from 'zod';
import {buildLearningCalendar,calendarPlanKey} from './learning-calendar';
import {matchesPlanDay} from './plan-course-status';

export type SessionSnapshot={mode:'local'|'wechat';days:DaySummary[];calendarDays:DaySummary[];events:StudyEvent[];ready:boolean;busy:boolean;error:string;selectedDay:number;identityKey:string;account:ProfileView|null;plan:PersonalPlan|null;reviewingCourse:boolean};
const credentialSchema=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.string().datetime(),identityKey:z.string().min(1)}).strict();
const persistedSchema=z.object({version:z.literal(1),mode:z.enum(['local','wechat']),selectedDay:z.number().int().positive(),credential:credentialSchema.optional(),calendarPlanKey:z.string().optional(),reviewingCourse:z.boolean().optional()}).strict();
type Persisted=z.infer<typeof persistedSchema>;
type Lesson=DailyBatch['content']['lessons'][number];
export type SessionDependencies={
 loadPlan:(mode:'local'|'wechat',token?:string)=>Promise<PersonalPlan|null>;createPlan:(mode:'local'|'wechat',input:{id:string;wordsPerDay:number;startedOn?:string},token?:string)=>Promise<PersonalPlan>;updatePlan:(mode:'local'|'wechat',input:{id:string;wordsPerDay:number;startedOn:string},token?:string)=>Promise<PersonalPlan>;
 read:()=>unknown;write:(value:Persisted)=>void;activate:(token:string)=>void;
 loadProfile:(token:string)=>Promise<ProfileView>;updateProfile:(token:string,nickName:string)=>Promise<ProfileView>;uploadAvatar:(token:string,path:string)=>Promise<ProfileView>;
 login:()=>Promise<SessionResponse>;revoke:(token:string)=>Promise<void>;days:(mode:'local'|'wechat')=>Promise<DaySummary[]>;
 events:(mode:'local'|'wechat',token?:string)=>Promise<StudyEvent[]>;
 save:(mode:'local'|'wechat',input:EventInput,lesson:Lesson,known:StudyEvent[],token?:string)=>Promise<StudyEvent[]>;
 isExpired:(error:unknown)=>boolean;now:()=>number;newId:()=>string;
};
export function createSessionController(deps:SessionDependencies){
 let saved:Persisted={version:1,mode:'local',selectedDay:1};
 let snapshot:SessionSnapshot={mode:'local',days:[],calendarDays:[],events:[],ready:false,busy:false,error:'',selectedDay:1,identityKey:'local',account:null,plan:null,reviewingCourse:false};
 const listeners=new Set<()=>void>();
 let initializing:Promise<void>|undefined;
 let restored=false;
 let pendingPlan:{id:string;wordsPerDay:number;startedOn?:string}|undefined;
 const pendingRecords=new Map<string,EventInput>();
 function currentDate(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(deps.now()));return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');}
 function publish(update:Partial<SessionSnapshot>){const next={...snapshot,...update};next.calendarDays=buildLearningCalendar(next.plan,next.days,currentDate());snapshot=next;for(const listener of listeners)listener();}
 function resolveSelection(plan:PersonalPlan|null,days:DaySummary[],day:number,previousKey?:string,review=false){const key=calendarPlanKey(plan);const changed=key!==previousKey;const reviewingCourse=review&&!changed;return {selectedDay:selected(reviewingCourse?days:buildLearningCalendar(plan,days,currentDate()),changed?1:day),calendarPlanKey:key,reviewingCourse:reviewingCourse||undefined};}
 function selected(days:DaySummary[],day:number){if(!days.length)throw Error('尚无已发布课程');if(!days.some(d=>d.day===day))throw Error(`已选择的第${day}天课程尚未发布，请检查课程列表`);return day;}
 function credential(){if(saved.mode==='wechat'&&(!saved.credential||Date.parse(saved.credential.expiresAt)<=deps.now()))throw Error('微信登录已过期，请到“我的”重新登录');return saved.credential?.token;}
 async function operation(action:()=>Promise<void>,affectsCurrentSession=false){
  if(snapshot.busy){publish({error:'正在处理，请稍候'});throw Error('正在处理，请稍候');}
  publish({busy:true,error:''});
  try{await action();}
  catch(error){
   let message=error instanceof Error?error.message:String(error);
   if(affectsCurrentSession&&deps.isExpired(error)&&saved.mode==='wechat'&&saved.credential){saved={...saved,credential:{...saved.credential,expiresAt:'1970-01-01T00:00:00.000Z'}};try{deps.write(saved);}catch{message+='；会话状态保存失败，请检查本机存储';}}
   publish({error:message});throw error;
  }finally{publish({busy:false});}
 }
 async function initialize(){
  if(snapshot.ready)return;
  if(initializing)return initializing;
  if(snapshot.busy)return;
  initializing=operation(async()=>{
   const raw=deps.read();
   if(raw!==''&&raw!==undefined){const result=persistedSchema.safeParse(raw);if(!result.success)throw Error('会话记录损坏，请重新登录或明确退出至本机学习');saved=result.data;if(saved.mode==='wechat'&&!saved.credential)throw Error('微信会话记录损坏，请重新登录');}
   restored=true;
   deps.activate(saved.mode==='wechat'?saved.credential!.token:'');
   publish({mode:saved.mode,selectedDay:saved.selectedDay,identityKey:saved.mode==='wechat'?saved.credential!.identityKey:'local',events:[],account:null,plan:null,reviewingCourse:false});
   credential();
   const [days,events,account,plan]=await Promise.all([deps.days(saved.mode),deps.events(saved.mode,saved.credential?.token),saved.mode==='wechat'?deps.loadProfile(credential()!):Promise.resolve(null),deps.loadPlan(saved.mode,saved.credential?.token)]);
   const {selectedDay,calendarPlanKey,reviewingCourse}=resolveSelection(plan,days,saved.selectedDay,saved.calendarPlanKey,saved.reviewingCourse);
   saved={...saved,selectedDay,calendarPlanKey,reviewingCourse};deps.write(saved);
   publish({days,events,account,plan,selectedDay,reviewingCourse:Boolean(reviewingCourse),ready:true});
  },true).finally(()=>{initializing=undefined;});
  return initializing;
 }
 async function login(){await operation(async()=>{
  const candidate=await deps.login();
  if(!/^[a-f0-9]{64}$/.test(candidate.token)||!Number.isFinite(Date.parse(candidate.expiresAt)))throw Error('服务器会话格式错误');
  if(Date.parse(candidate.expiresAt)<=deps.now())throw Error('微信登录已过期，请重新登录');
  const [days,events,account,plan]=await Promise.all([deps.days('wechat'),deps.events('wechat',candidate.token),deps.loadProfile(candidate.token),deps.loadPlan('wechat',candidate.token)]);
  const {selectedDay,calendarPlanKey}=resolveSelection(plan,days,saved.reviewingCourse?1:snapshot.selectedDay,saved.calendarPlanKey);
  const next:Persisted={version:1,mode:'wechat',selectedDay,calendarPlanKey,credential:{...candidate,identityKey:deps.newId()}};
  deps.write(next);saved=next;restored=true;pendingPlan=undefined;pendingRecords.clear();deps.activate(candidate.token);
  publish({mode:'wechat',days,events,account,plan,selectedDay,reviewingCourse:false,identityKey:next.credential!.identityKey,ready:true});
 });}
 async function logout(){await operation(async()=>{
  const next:Persisted={version:1,mode:'local',selectedDay:1};
  const revoked=saved.mode==='wechat'&&Boolean(saved.credential);
  if(revoked)await deps.revoke(saved.credential!.token);
  try{deps.write(next);}catch(error){
   if(revoked){saved={...saved,credential:{...saved.credential!,expiresAt:'1970-01-01T00:00:00.000Z'}};deps.activate('');publish({ready:false,days:[],events:[],account:null,plan:null});throw Error('退出已生效，但本机状态保存失败，请重试退出登录');}
   throw error;
  }
  saved=next;restored=true;pendingPlan=undefined;pendingRecords.clear();deps.activate('');
  publish({mode:'local',days:[],events:[],selectedDay:1,identityKey:'local',account:null,plan:null,reviewingCourse:false,ready:false});
  const [days,events,plan]=await Promise.all([deps.days('local'),deps.events('local'),deps.loadPlan('local')]);
  const selection=resolveSelection(plan,days,1);saved={...saved,...selection};deps.write(saved);
  publish({days,events,plan,selectedDay:selection.selectedDay,reviewingCourse:false,ready:true});
 });}
 async function refresh(){await operation(async()=>{
  if(!restored)throw Error('会话记录无法恢复，请重新登录或明确退出至本机学习');credential();
  const [days,events,account,plan]=await Promise.all([deps.days(saved.mode),deps.events(saved.mode,saved.credential?.token),saved.mode==='wechat'?deps.loadProfile(credential()!):Promise.resolve(null),deps.loadPlan(saved.mode,saved.credential?.token)]);
  const {selectedDay,calendarPlanKey,reviewingCourse}=resolveSelection(plan,days,snapshot.selectedDay,saved.calendarPlanKey,saved.reviewingCourse);const next={...saved,selectedDay,calendarPlanKey,reviewingCourse};deps.write(next);saved=next;
  for(const [key,input] of pendingRecords)if(events.some(event=>event.id===input.id))pendingRecords.delete(key);
  publish({days,events,account,plan,selectedDay,reviewingCourse:Boolean(reviewingCourse),ready:true});
 },true);}
 async function selectDay(day:number){await operation(async()=>{
  if(!snapshot.ready||!restored||!snapshot.calendarDays.some(d=>d.day===day))throw Error('该学习日尚未到达或不在计划中');
  const next={...saved,selectedDay:day,reviewingCourse:undefined};deps.write(next);saved=next;publish({selectedDay:day,reviewingCourse:false});
 });}
 async function openReview(day:number){await operation(async()=>{if(!snapshot.ready||!snapshot.days.some(item=>item.day===day))throw Error('原课程尚未发布');const next={...saved,selectedDay:day,reviewingCourse:true};deps.write(next);saved=next;publish({selectedDay:day,reviewingCourse:true});});}
 async function record(input:EventInput,lesson:Lesson){await operation(async()=>{
  if(restored)credential();if(!snapshot.ready||!restored)throw Error('学习记录尚未初始化');
  if(!snapshot.days.some(day=>day.day===input.day)||input.lessonId!==lesson.id)throw Error('学习记录与课程不一致');
  if(saved.mode==='wechat'&&snapshot.plan&&!snapshot.reviewingCourse){const course=snapshot.days.find(day=>day.day===input.day)!;if(!course.targetWords||!matchesPlanDay(snapshot.plan,input.day,course.targetWords))throw Error('本日课程与计划词表不一致，暂不能保存为计划进度');}
  const key=JSON.stringify([input.day,input.lessonId,input.type,input.word??null,input.favorite??null,input.answers??null]);
  const attempt=pendingRecords.get(key)??input;pendingRecords.set(key,attempt);
  const events=await deps.save(saved.mode,attempt,lesson,snapshot.events,saved.credential?.token);
  for(const [pendingKey,event] of pendingRecords)if(event.day===input.day&&event.lessonId===input.lessonId&&event.type===input.type&&event.word===input.word)pendingRecords.delete(pendingKey);
  publish({events});
 },true);}
 async function startPlan(wordsPerDay:number,startedOn?:string){await operation(async()=>{
  if(!snapshot.ready||!restored)throw Error('请先等学习信息读取完成');
  const token=credential();const parsed=dailyWordCountSchema.safeParse(wordsPerDay);if(!parsed.success)throw Error('每日词数须为10至80之间的整数');
  if(snapshot.plan)throw Error('已开始学习计划，请查看现有计划');
  if(!pendingPlan||pendingPlan.wordsPerDay!==wordsPerDay||pendingPlan.startedOn!==startedOn)pendingPlan={id:deps.newId(),wordsPerDay,...(startedOn?{startedOn}:{})};
  const plan=await deps.createPlan(saved.mode,pendingPlan,token);const next={...saved,selectedDay:1,reviewingCourse:undefined,calendarPlanKey:calendarPlanKey(plan)};deps.write(next);saved=next;pendingPlan=undefined;publish({plan,selectedDay:1,reviewingCourse:false});
 },true);}
 async function changePlan(wordsPerDay:number,startedOn:string){await operation(async()=>{
  if(!snapshot.ready||!restored||!snapshot.plan)throw Error('请先开始计划');
  const candidate=personalPlanSchema.parse({...snapshot.plan,wordsPerDay,startedOn});
  const plan=await deps.updatePlan(saved.mode,{id:candidate.id,wordsPerDay,startedOn},credential());const next={...saved,selectedDay:1,reviewingCourse:undefined,calendarPlanKey:calendarPlanKey(plan)};deps.write(next);saved=next;publish({plan,selectedDay:1,reviewingCourse:false});
 },true);}
 async function updateProfile(nickName:string){await operation(async()=>{if(saved.mode!=='wechat'||!snapshot.ready)throw Error('请先微信登录');const account=await deps.updateProfile(credential()!,nickName);publish({account});},true);}
 async function uploadAvatar(path:string){await operation(async()=>{if(saved.mode!=='wechat'||!snapshot.ready)throw Error('请先微信登录');const account=await deps.uploadAvatar(credential()!,path);publish({account});},true);}
 function refreshCalendar(){publish({});}
 return {getSnapshot:()=>snapshot,subscribe:(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},initialize,login,logout,refresh,refreshCalendar,selectDay,openReview,record,updateProfile,uploadAvatar,startPlan,changePlan};
}
