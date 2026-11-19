import {legacyCourseFor} from '../../shared/legacy-courses';
import {dayProgress} from '../../shared/dashboard';
import {matchesPlanDay} from '../../shared/plan-course-status';
import {useEffect,useRef,useState} from 'react';
import {View,Text,Button,Picker,ScrollView} from '@tarojs/components';
import Taro,{useDidHide,useDidShow} from '@tarojs/taro';
import {readingParts,normalizeWord,includesWord} from '../../shared/lexical';
import type {DailyBatch} from '../../shared/daily-types';
import * as study from '../../services/study';
import {playAudio,stopAudio} from '../../services/audio';
import {session,useStudySession} from '../../services/session';
import WordReview from '../../components/WordReview';

type Lookup={word:string;meaning:string;ipa:string;lessonId:string};
const TRIAL_INTRO_KEY='wordscape:trial-intro:v1';
export default function LearningPage(){
 const account=useStudySession();const [visit,setVisit]=useState(0);const [trialStarted,setTrialStarted]=useState(()=>Boolean(Taro.getStorageSync(TRIAL_INTRO_KEY)));
 useDidHide(stopAudio);useDidShow(()=>{session.refreshCalendar();setVisit(value=>value+1);});
 async function startTrial(){if(account.selectedDay!==1)await session.selectDay(1);Taro.setStorageSync(TRIAL_INTRO_KEY,true);setTrialStarted(true);}
 if(account.ready&&account.mode==='local'&&!trialStarted)return <View className='trial-splash'>
  <View className='trial-splash-mark'>3</View><Text className='brand'>WORDSCAPE 三天试学</Text><Text className='heading'>先用三天，感受情境记单词</Text>
  <Text className='muted'>每天30个随机新词，配合真实短文、英式发音和理解测验。试学记录只保存在当前设备。</Text>
  <View className='trial-steps'><Text>第1天 · 熟悉学习方式</Text><Text>第2天 · 连续阅读与测验</Text><Text>第3天 · 完成一次完整体验</Text></View>
  <Button className='primary-button' onClick={()=>void startTrial()}>开始三天试学</Button>
  <Button onClick={()=>void Taro.switchTab({url:'/pages/plan/index'})}>登录并设置正式计划</Button>
 </View>;
 return <LearningContent key={account.identityKey} account={account} visit={visit}/>;
}
function LearningContent({account,visit}:{account:ReturnType<typeof useStudySession>;visit:number}){
 const mode=account.mode,list=mode==='local'?account.days.slice(0,3):account.calendarDays,all=account.events;
 const [course,setCourse]=useState<DailyBatch>();
 const [archived,setArchived]=useState(false);
 const [lessonIndex,setLessonIndex]=useState(0);const [tab,setTab]=useState('情境练习');
 const [revealed,setRevealed]=useState<number[]>([]);const [answers,setAnswers]=useState<number[]>([]);const [submitted,setSubmitted]=useState(false);
 const [lookup,setLookup]=useState<Lookup>();const [lookupError,setLookupError]=useState('');const [error,setError]=useState('');const [working,setWorking]=useState(false);
 const [reload,setReload]=useState(0);
 const [calendar,setCalendar]=useState(false);const [month,setMonth]=useState('2026-10');
 const lock=useRef(false),pendingLesson=useRef<string>(),restoredQuizId=useRef<string>();const busy=working||account.busy;
 const lesson=course?.content.lessons[lessonIndex];
 const calendarDate=(account.reviewingCourse?account.days:list).find(day=>day.day===account.selectedDay)?.date;
 useEffect(()=>{if(calendarDate)setMonth(calendarDate.slice(0,7));},[calendarDate]);
 function restore(b:DailyBatch,index:number,records:study.StudyEvent[]){
  const last=study.latestQuiz(records,b.day,b.content.lessons[index].id);
  restoredQuizId.current=last?.id;setAnswers(last?.answers||[]);setSubmitted(Boolean(last));setRevealed([]);setLookup(undefined);setLookupError('');stopAudio();
 }
 async function run(action:()=>Promise<void>,report:(message:string)=>void=setError){if(lock.current||busy)return;lock.current=true;setWorking(true);report('');try{await action();}catch(e){report(e instanceof Error?e.message:'操作失败，请查看开发者工具中的错误信息');}finally{lock.current=false;setWorking(false);}}
 async function openDay(day:number){await session.selectDay(day);}
 useEffect(()=>{
  if(!account.ready){setCourse(undefined);return;}
  let active=true;setArchived(false);setWorking(true);setError('');setCourse(undefined);stopAudio();
  void study.batch(mode,account.selectedDay).then(b=>{
   if(!active)return;
   if(mode==='wechat'&&account.plan&&!account.reviewingCourse&&!matchesPlanDay(account.plan,b.day,b.words))throw Error('本日'+account.plan.wordsPerDay+'词课程尚未制作，现有课程不会替代你的计划');
   const index=pendingLesson.current?b.content.lessons.findIndex(l=>l.id===pendingLesson.current):0;
   pendingLesson.current=undefined;
   if(index<0)throw Error('收藏对应情境不存在');setCourse(b);setLessonIndex(index);restore(b,index,all);
  }).catch(e=>{if(active){pendingLesson.current=undefined;setError(e instanceof Error?e.message:'课程加载失败');}}).finally(()=>{if(active)setWorking(false);});
  return ()=>{active=false;stopAudio();};
 },[account.ready,account.selectedDay,reload,account.reviewingCourse,account.plan?.id,account.plan?.startedOn,account.plan?.wordsPerDay]);
 useEffect(()=>{if(course&&study.latestQuiz(all,course.day,course.content.lessons[lessonIndex].id)?.id!==restoredQuizId.current)restore(course,lessonIndex,all);},[visit,all,course,lessonIndex]);
 useEffect(()=>stopAudio,[]);
 async function record(type:study.EventInput['type'],extra:Partial<study.EventInput>={}){
  if(archived)throw Error('旧课程仅供回看，请返回随机课程继续学习');
  if(!course||!lesson)throw Error('课程未加载');
  const input:study.EventInput={...extra,id:study.newId(),day:course.day,lessonId:extra.lessonId??lesson.id,type};
  const sourceLesson=course.content.lessons.find(item=>item.id===input.lessonId);
  if(!sourceLesson)throw Error('记录对应情境不存在');
  await session.record(input,sourceLesson);if(type==='quiz')restoredQuizId.current=input.id;
 }
 function chooseLesson(index:number){if(busy||!course)return;setLessonIndex(index);restore(course,index,all);}
 function showWord(raw:string){if(!course)return;const word=normalizeWord(raw);const meaning=course.content.dictionary[word]||course.content.targets[word]?.meaning;
  if(!meaning){setError(`课程缺少词义：${word}`);return;}
  const ipa=course.pronunciations[word]?.ipa||course.content.targets[word]?.ipa;
  if(!ipa){setError(`课程缺少音标：${word}`);return;}const source=lesson?.paragraphs.some(p=>includesWord(p.en,word))?lesson:course.content.lessons.find(l=>l.paragraphs.some(p=>includesWord(p.en,word)));if(!source){setError(`该词没有对应情境：${word}`);return;}stopAudio();setLookupError('');setLookup({word,meaning,ipa,lessonId:source.id});
 }
 const saved=study.favorites(all);const selectedSaved=lookup&&saved.some(e=>e.word===lookup.word&&e.day===course?.day);
 function reportAudioError(message:string,report:(message:string)=>void=setError){report(message);void Taro.showToast({title:message,icon:'none',duration:4000});}
 function moveMonth(delta:number){const [y,m]=month.split('-').map(Number);setMonth(new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7));}
 const [year,monthNumber]=month.split('-').map(Number);const first=new Date(Date.UTC(year,monthNumber-1,1)).getUTCDay();const dayCount=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
 function dayDone(day:number){if(mode==='wechat'&&account.plan){const metadata=account.days.find(item=>item.day===day);if(!metadata?.targetWords||!matchesPlanDay(account.plan,day,metadata.targetWords))return false;}return dayProgress(day,all).complete;}
 return <View className='page'>
  <Text className='brand'>WORDSCAPE · 每日英语</Text><Text className='heading'>把单词放进生活里</Text>
  <Text className='muted'>{mode==='local'?'三天试学 · 学习记录保存在此设备':'微信账号记录 · 阅读、答题与收藏按账号保存'}</Text>
  {mode==='local'&&<Button size='mini' onClick={()=>void Taro.switchTab({url:'/pages/profile/index'})}>前往我的登录</Button>}
  {account.error&&<View className='error'>{account.error}</View>}
  {error&&<View className='error'>{error}</View>}
  {error&&!course&&account.ready&&<Button disabled={busy} onClick={()=>setReload(value=>value+1)}>重新加载课程</Button>}
  {busy&&<Text className='muted'>正在处理，请稍候…</Text>}
  {archived&&<View className='card'><Text>旧版第{course?.day}天 · 仅供回看，原记录保留</Text><Button onClick={()=>setReload(value=>value+1)}>返回随机课程</Button></View>}
  {!archived&&account.ready&&list.length>0&&<>
   <View className='card row'>{account.reviewingCourse?<><Text>复习原课程第{account.selectedDay}天 · {calendarDate}</Text><Button size='mini' disabled={busy} onClick={()=>void run(()=>session.selectDay(1))}>返回计划课程</Button></>:<Picker disabled={busy} mode='selector' range={list.map(d=>mode==='local'?`试学第${d.day}天`:`第${d.day}天 · ${d.date}`)} value={list.findIndex(d=>d.day===account.selectedDay)} onChange={e=>void run(()=>openDay(list[Number(e.detail.value)].day))}><Text className='link'>{mode==='local'?`三天试学 · 第${account.selectedDay}天`:`第${account.selectedDay}天 · ${calendarDate}`} ▾</Text></Picker>}{mode==='wechat'&&<Button size='mini' disabled={busy} onClick={()=>setCalendar(!calendar)}>学习日历</Button>}</View>
   {mode==='wechat'&&calendar&&<View className='card'><View className='row'><Button size='mini' onClick={()=>moveMonth(-1)}>上月</Button><Text>{month}</Text><Button size='mini' onClick={()=>moveMonth(1)}>下月</Button></View><View className='calendar'>{['日','一','二','三','四','五','六'].map(x=><Text key={x} className='cell'>{x}</Text>)}{Array.from({length:first},(_,i)=><Text key={`blank${i}`} className='cell'/>)}{Array.from({length:dayCount},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,'0')}`;const d=list.find(x=>x.date===date);return <View key={date} className={`cell ${d?'published':''} ${calendarDate===date?'selected':''}`} onClick={()=>d&&!busy&&void run(()=>openDay(d.day))}>{i+1}{d&&dayDone(d.day)&&<Text className='tick'>✓</Text>}</View>;})}</View><Text className='muted'>有边框的日期可选择；已发布课程全部情境读完并提交测验后显示✓。</Text></View>}
  </>}
  {course&&<>
   <View className='stats'><Text>{course.words.length} 个新词</Text><Text>{course.content.lessons.length} 个情境</Text><Text>{study.completed(course,all)?'本日已完成 ✓':'循序渐进'}</Text></View>
   {tab!=='单词巩固'&&<View className='card word-list'><Text className='title'>本日新词</Text>{course.words.map(word=><Text key={word} className='word-chip' onClick={()=>showWord(word)}>{word}</Text>)}</View>}
  </>}
  {account.ready&&<View className='row tabs'>{['情境练习','单词巩固','生词本','学习历史'].map(t=><Button key={t} size='mini' className={t===tab?'active':''} onClick={()=>{stopAudio();setTab(t);}}>{t}</Button>)}</View>}
  {course&&tab==='单词巩固'&&!archived&&<WordReview key={course.day+':'+course.words.join(',')} course={course} events={all} busy={busy} save={async(word,answerText)=>{
   const source=course.content.lessons.find(item=>item.paragraphs.some(p=>includesWord(p.en,word)));if(!source)throw Error('目标词缺少对应情境');
   const event=await session.record({id:study.newId(),day:course.day,lessonId:source.id,type:'recall',word,answerText},source);
   if(event.score===undefined)throw Error('巩固评分没有返回');return event.score;
  }}/>}
  {course&&tab==='情境练习'&&study.completed(course,all)&&<View className='card'><Text className='title'>短文学完了，巩固一下今日单词</Text><Button onClick={()=>{stopAudio();setTab('单词巩固');}}>开始巩固</Button></View>}
   {course&&tab==='情境练习'&&lesson&&<>
    <ScrollView scrollX className='lesson-scroll'><View className='lesson-list'>{course.content.lessons.map((l,i)=><Button key={l.id} size='mini' disabled={busy} className={i===lessonIndex?'active':''} onClick={()=>chooseLesson(i)}>{i+1}. {l.subtitle}</Button>)}</View></ScrollView>
    <View className='card'><Text className='title'>{lesson.title}</Text><Text className='muted'>点击英文词查看本段词义和音标</Text>
     {lesson.paragraphs.map((p,i)=><View key={i} className='paragraph'><View className='english'>{readingParts(p.en,course.words).map((part,j)=>/^[a-z]/i.test(part)?<Text key={j} className={course.words.includes(normalizeWord(part))?'target':''} onClick={()=>showWord(part)}>{part}</Text>:<Text key={j}>{part}</Text>)}</View><Button size='mini' onClick={()=>playAudio(`paragraph:${lesson.id}:${i}`,reportAudioError)}>播放整段英式发音</Button><Button size='mini' onClick={()=>setRevealed(revealed.includes(i)?revealed.filter(x=>x!==i):[...revealed,i])}>{revealed.includes(i)?'隐藏译文':'查看译文'}</Button>{revealed.includes(i)&&<Text className='translation'>{p.zh}</Text>}<View className='patterns'>{p.patterns.map(pattern=><View key={pattern.expression}><Text className='pattern'>{pattern.expression}</Text><Text className='muted'>{pattern.meaning}</Text></View>)}</View></View>)}
     <Button disabled={busy||archived} onClick={()=>void run(()=>record('read'))}>{all.some(e=>e.day===course.day&&e.lessonId===lesson.id&&e.type==='read')?'已读完 ✓':'标记读完'}</Button>
    </View>
    <View className='card'><Text className='title'>英文理解测验</Text>{lesson.questions.map((q,i)=><View key={i} className='question'><Text className='quiz-prompt'>{i+1}. {q.prompt}</Text>{q.options.map((o,j)=>{const result=submitted?(j===q.answer?'correct':answers[i]===j?'wrong':''):'';return <Button key={j} disabled={busy||submitted||archived} className={`option ${answers[i]===j?'chosen':''} ${result}`} onClick={()=>{const copy=answers.slice();copy[i]=j;setAnswers(copy);}}>{String.fromCharCode(65+j)}. {o}</Button>;})}{submitted&&<Text className='translation'>{answers[i]===q.answer?'✓ 正确':'正确答案：'+String.fromCharCode(65+q.answer)} · {q.explanation}</Text>}</View>)}<Button disabled={busy||submitted||archived} onClick={()=>void run(async()=>{if(lesson.questions.some((_,i)=>!Number.isInteger(answers[i])))throw Error('请答完所有题再提交');await record('quiz',{answers});setSubmitted(true);})}>{submitted?'已提交并保存':'提交测验'}</Button>{submitted&&!archived&&<Button onClick={()=>{setAnswers([]);setSubmitted(false);}}>重新练习</Button>}</View>
   </>}
   {tab==='生词本'&&<View className='card'><Text className='title'>已收藏 {saved.length} 词</Text>{!saved.length&&<Text className='muted'>阅读时点击英文词即可收藏。</Text>}{saved.map(e=><View key={e.day+':'+e.word} className='row'><Text>{e.word} · 第{e.day}天</Text><Button size='mini' disabled={busy} onClick={()=>void run(async()=>{const previous=legacyCourseFor(e.day,e.lessonId);if(previous){const index=previous.content.lessons.findIndex(l=>l.id===e.lessonId);setArchived(true);setCourse(previous);setLessonIndex(index);restore(previous,index,all);setError('');}else if(course&&!archived&&e.day===course.day){const i=course.content.lessons.findIndex(l=>l.id===e.lessonId);if(i<0)throw Error('收藏对应情境不存在');chooseLesson(i);}else{pendingLesson.current=e.lessonId;try{await session.openReview(e.day);setReload(value=>value+1);}catch(e){pendingLesson.current=undefined;throw e;}}setTab('情境练习');})}>回到情境</Button></View>)}</View>}
   {tab==='学习历史'&&<View className='card'><Text className='title'>学习历史</Text>{!all.length&&<Text className='muted'>还没有学习记录。</Text>}{[...all].reverse().filter(e=>e.type!=='favorite').map(e=><View key={e.id} className='history'>第{e.day}天 · {e.type==='recall'?`${e.word} · 单词巩固${e.score===1?'正确':'待复习'}`:e.lessonId+' · '+(e.type==='read'?'阅读完成':`测验 ${e.score}/${e.answers?.length}`)}<Text className='muted'>{new Date(e.createdAt).toLocaleString()}</Text></View>)}</View>}
  {lookup&&course&&<View className='overlay'><View className='dialog'><Text className='heading'>{lookup.word}</Text><Text>{lookup.ipa}</Text><Text className='title'>本段含义</Text><Text>{lookup.meaning}</Text>{course.content.targets[lookup.word]&&<><Text className='title'>目标词释义</Text><Text>{course.content.targets[lookup.word].meaning}</Text>{course.content.targets[lookup.word].senses?.map(s=><Text key={s.pos+s.meaning}>{s.pos}：{s.meaning}</Text>)}</>}<Button onClick={()=>{setLookupError('');playAudio(`word:${lookup.word}`,message=>reportAudioError(message,setLookupError));}}>播放单词英式发音</Button>{lookupError&&<Text className='error'>{lookupError}</Text>}<Button disabled={busy||archived} onClick={()=>void run(()=>record('favorite',{word:lookup.word,favorite:!selectedSaved,lessonId:lookup.lessonId}),setLookupError)}>{selectedSaved?'取消收藏':'收藏生词'}</Button><Button disabled={busy} onClick={()=>{setLookup(undefined);setLookupError('');stopAudio();}}>关闭</Button></View></View>}
 </View>;
}
