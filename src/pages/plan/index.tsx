import {planCourseStatus} from '../../shared/plan-course-status';
import {useState} from 'react';
import {View,Text,Button,Input,Slider,Picker} from '@tarojs/components';
import Taro,{useDidShow} from '@tarojs/taro';
import {session,useStudySession} from '../../services/session';
import {today} from '../../shared/daily-plan';
import {MIN_DAILY_WORDS,MAX_DAILY_WORDS,elapsedPlanDays,parseDailyWordCount,planEstimate,planSummary,personalPlanDay} from '../../shared/personal-plan';
import SessionNotice from '../../components/SessionNotice';
import AccountSheet from '../../components/AccountSheet';
function PlanContent({onLogin}:{onLogin:()=>void}){
 useDidShow(()=>{if(session.getSnapshot().mode==='wechat')void session.refreshCalendar();});
 const state=useStudySession();const [count,setCount]=useState(String(state.plan?.wordsPerDay??30));const [startedOn,setStartedOn]=useState(state.plan?.startedOn??today());const [editing,setEditing]=useState(false);const [visible,setVisible]=useState(7);const [expanded,setExpanded]=useState<number|null>(null);const [error,setError]=useState('');
 let selected:number|null=null;try{selected=parseDailyWordCount(count);}catch{/* 输入未完成时显示校验提示。 */}
 const estimate=selected===null?null:planEstimate(selected,startedOn);
 const summary=state.plan?planSummary(state.plan):null;
 const elapsed=state.plan?elapsedPlanDays(state.plan,today()):0;
 const shownDays=summary?Math.min(Math.max(visible,elapsed),summary.totalDays):0;
 let courseStatus:ReturnType<typeof planCourseStatus>|null=null;let courseStatusError='';
 if(state.ready&&state.plan){try{courseStatus=planCourseStatus(state.plan,state.days,today());}catch(e){courseStatusError=e instanceof Error?e.message:'课程状态读取失败';}}
 async function start(){
  if(selected===null)return;
  const current=state.plan;const changed=Boolean(editing&&current&&(current.wordsPerDay!==selected||current.startedOn!==startedOn));const historical=startedOn<today();
  if(changed||historical){
   const lines:string[]=[];
   if(changed)lines.push('新的每日词数或开始日期会重新计算课程安排。已有学习记录会保留，但不计入新计划进度。');
   if(historical)lines.push(`开始日期早于今天，保存后会产生从${startedOn}至今天的待学习课程。`);
   const confirmation=await Taro.showModal({title:editing?'确认修改计划':'确认历史开始日期',content:lines.join('\n'),confirmText:'确认保存'});
   if(!confirmation.confirm)return;
  }
  try{
   setError('');if(editing)await session.changePlan(selected,startedOn);else await session.startPlan(selected,startedOn);setEditing(false);
   const next=session.getSnapshot();const nextPlan=next.plan;
   if(!nextPlan)throw Error('计划保存后未能读取，请刷新计划');
   let first:ReturnType<typeof planCourseStatus>['days'][number]|undefined;
   try{first=planCourseStatus(nextPlan,next.days,today()).days.find(item=>item.day===1);}catch(e){
    setError(e instanceof Error?`计划已保存，但${e.message}`:'计划已保存，但课程状态读取失败');
    await Taro.showModal({title:'计划已保存',content:'课程状态暂时无法读取，请刷新计划后再试。',showCancel:false,confirmText:'知道了'});return;
   }
   if(first?.courseDay!==null&&first?.courseDay!==undefined){
    const result=await Taro.showModal({title:'计划已保存',content:'第1天课程已经准备好，现在开始学习。',confirmText:'开始学习',cancelText:'稍后'});
    if(result.confirm){await session.selectDay(first.courseDay);await Taro.switchTab({url:'/pages/index/index'});}
   }else await Taro.showModal({title:'计划已保存',content:'第1天课程尚待生成，准备完成后即可开始学习。',showCancel:false,confirmText:'知道了'});
  }catch(e){setError(e instanceof Error?e.message:'计划保存失败');}
 }
 async function refresh(){try{setError('');await session.refresh();}catch{/* 读取错误由共享会话显示。 */}}
 async function openDay(day:number){try{setError('');await session.selectDay(day);await Taro.switchTab({url:'/pages/index/index'});}catch(e){setError(e instanceof Error?e.message:'无法切换学习日');}}
 return <View className='page'>
  <Text className='brand'>MY LEARNING PLAN</Text><Text className='heading'>学习计划</Text>
  <SessionNotice/>{error&&<View className='error'>{error}</View>}
  {(state.mode!=='wechat'||(!state.ready&&!state.busy))&&<View className='card hero-card'>
   <Text className='title'>{state.mode==='wechat'?'重新登录后继续计划':'登录后开始学习计划'}</Text>
   <Text className='muted'>学习计划和进度保存到微信账号，更换设备后仍可继续。</Text>
   <Button className='wechat-login-button' disabled={state.busy} onClick={onLogin}>{state.mode==='wechat'?'重新微信登录':'微信登录并开始计划'}</Button>
  </View>}
  {state.mode==='wechat'&&state.ready&&<>
   <Button size='mini' disabled={state.busy} onClick={()=>void refresh()}>刷新计划</Button>
   {!state.plan||editing?<View className='card hero-card'>
    <Text className='title'>{editing?'修改学习计划':'开始前，选择每天学习多少词'}</Text><Text className='muted'>每日可选10～80词，按整数设置。</Text>
    <View className='daily-count-row'><Input className='daily-count-input' type='number' maxlength={3} value={count} onInput={event=>setCount(event.detail.value)} /><Text>词 / 天</Text></View>
    {selected!==null?<Slider min={MIN_DAILY_WORDS} max={MAX_DAILY_WORDS} step={1} value={selected} activeColor='#245fbc' onChange={event=>setCount(String(event.detail.value))}/>:<Text className='error'>请输入10至80之间的整数</Text>}
    <Picker mode='date' start='2000-01-01' end={today()} value={startedOn} disabled={state.busy} onChange={event=>setStartedOn(event.detail.value)}><Text className='link'>开始日期：{startedOn} ▾</Text></Picker>
    {estimate&&<><Text className='title'>共{estimate.totalWords}词，预计{estimate.totalDays}天</Text><Text className='muted'>从{startedOn}开始，预计{estimate.endsOn}完成。最后一天安排剩余单词。</Text></>}
    <Text className='muted'>计划保存到当前微信账号。开始日期早于今天时，会产生对应的待学习课程。</Text>
    <Button className='primary-button' disabled={state.busy||selected===null} onClick={()=>void start()}>{editing?'保存修改':'开始计划'}</Button>{editing&&<Button disabled={state.busy} onClick={()=>setEditing(false)}>取消修改</Button>}
   </View>:summary&&<>
    <View className='card hero-card'><Text className='eyebrow'>我的每日计划</Text><Text className='heading'>每天{state.plan.wordsPerDay}词</Text><Text className='muted'>共{summary.totalWords}词 · {summary.totalDays}天</Text><Text className='muted'>{state.plan.startedOn}开始 · 预计{summary.endsOn}完成</Text><Text className='muted'>已保存到微信账号，可跨设备同步。</Text>
     {courseStatusError?<Text className='course-status course-status-error'>课程状态读取失败</Text>:courseStatus?.days[0]?.courseDay!==null&&courseStatus?.days[0]?.courseDay!==undefined?<Button className='primary-button' disabled={state.busy} onClick={()=>void openDay(courseStatus.days[0].courseDay!)}>开始第1天学习</Button>:<Text className='course-status course-status-pending'>第1天课程待生成</Text>}
    </View>
    <Button disabled={state.busy} onClick={()=>{setCount(String(state.plan!.wordsPerDay));setStartedOn(state.plan!.startedOn);setEditing(true);}}>修改计划</Button>
    <Text className='title'>每天的单词安排</Text>
    {Array.from({length:shownDays},(_,index)=>{const day=personalPlanDay(state.plan!,index+1);const status=courseStatus?.days.find(item=>item.day===day.day);const ready=status?.courseDay!==null&&status?.courseDay!==undefined;const statusText=courseStatusError?'状态读取失败':ready?'可学习':'待生成';const statusClass=courseStatusError?'course-status course-status-error':ready?'course-status course-status-ready':'course-status course-status-pending';return <View key={day.day} className='card plan-card'>
     <View className='row'><View><Text className='title'>第{day.day}天 · {day.words.length}词</Text><Text className={statusClass}>{statusText}</Text></View><Text className='muted'>{day.date}</Text></View>
     <View className='plan-actions'><Button size='mini' onClick={()=>setExpanded(expanded===day.day?null:day.day)}>{expanded===day.day?'收起单词':'查看单词'}</Button>
      {ready&&<Button size='mini' disabled={state.busy} onClick={()=>void openDay(status!.courseDay!)}>进入本日课程</Button>}</View>
     {expanded===day.day&&<View className='plan-words'>{day.words.map(word=><Text className='plan-word' key={word}>{word}</Text>)}</View>}
    </View>;})}
    {shownDays<summary.totalDays&&<Button onClick={()=>setVisible(Math.min(shownDays+7,summary.totalDays))}>再看7天</Button>}
   </>}
   {courseStatusError&&<View className='error'>{courseStatusError}</View>}
   {courseStatus&&<View className='card'><Text className='title'>{courseStatus.total===0?'计划尚未开始':courseStatus.missing===0?'短文与测验已准备':'部分课程待制作'}</Text><Text className='muted'>当前计划已到{courseStatus.total}天，已准备{courseStatus.ready}天课程。{courseStatus.missing>0?'还有'+courseStatus.missing+'天课程尚待制作。':'可在对应日期点击“进入本日课程”，继续阅读和测验。'}</Text></View>}
  </>}
 </View>;
}
export default function Plan(){const state=useStudySession();const [loginOpen,setLoginOpen]=useState(false);return <View><PlanContent key={state.identityKey} onLogin={()=>setLoginOpen(true)}/>{loginOpen&&<AccountSheet mode='login' onClose={()=>setLoginOpen(false)}/>}</View>;}
