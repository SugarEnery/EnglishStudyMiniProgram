import {useState} from 'react';
import {View,Text,Button,Image} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {session,useStudySession} from '../../services/session';
import {favorites} from '../../shared/progress';
import {studyOverview} from '../../shared/dashboard';
import SessionNotice from '../../components/SessionNotice';
import AccountSheet,{type AccountSheetMode} from '../../components/AccountSheet';
export default function Profile(){
 const state=useStudySession();const overview=studyOverview(state.days,state.events);const [sheet,setSheet]=useState<AccountSheetMode|null>(null);
 async function act(action:()=>Promise<unknown>){try{await action();}catch{/* 错误由共享会话状态显示。 */}}
 async function logout(){const result=await Taro.showModal({title:'退出登录',content:'账号记录会保留，退出后显示本机记录。',confirmText:'退出登录'});if(result.confirm)await act(()=>session.logout());}
 async function options(){
  const items=state.mode==='wechat'?['刷新学习记录','重新登录','退出登录']:['重新读取本机记录','重新启用本机学习'];
  let choice:number;try{choice=(await Taro.showActionSheet({itemList:items})).tapIndex;}catch{return;}
  if(choice===0)await act(()=>session.refresh());
  else if(state.mode==='wechat'&&choice===1)setSheet('login');
  else if(state.mode==='wechat')await logout();
  else await act(()=>session.logout());
 }
 return <View className='page'>
  <Text className='brand'>MY WORDSCAPE</Text><Text className='heading'>我的</Text>
  <Button className='card profile-card profile-entry' disabled={state.busy} onClick={()=>setSheet(state.mode==='wechat'&&state.ready?'profile':'login')}>
   {state.account?.avatarPath?<Image className='profile-symbol' src={state.account.avatarPath} mode='aspectFill'/>:<View className='profile-symbol'>W</View>}
   <View className='profile-copy'><Text className='title'>{state.mode==='wechat'?(state.account?.profile.nickName||'微信账号'):'点击微信登录'}</Text>{state.mode==='wechat'&&state.account?.profile.userId&&<Text className='muted'>ID：{state.account.profile.userId}</Text>}<Text className='muted'>{state.mode==='wechat'?'点击修改头像和昵称':'同步学习进度和每日计划'}</Text></View><Text className='profile-chevron'>›</Text>
  </Button>
  {!sheet&&<SessionNotice/>}
  {state.ready&&<>
   <View className='card'><Text className='title'>每日学习计划</Text><Text className='muted'>{state.plan?'当前计划：每天'+state.plan.wordsPerDay+'词。':'开始前可选择每日10～80词，再生成每天的单词安排。'}</Text><Button onClick={()=>void Taro.switchTab({url:'/pages/plan/index'})}>{state.plan?'查看我的计划':'设置每日词数'}</Button></View>
   <View className='overview-grid'><View className='metric'><Text className='metric-value'>{overview.completedDays}</Text><Text className='muted'>完成天数</Text></View><View className='metric'><Text className='metric-value'>{overview.readLessons}</Text><Text className='muted'>读完情境</Text></View><View className='metric'><Text className='metric-value'>{favorites(state.events).length}</Text><Text className='muted'>收藏单词</Text></View></View>
   <View className='card'><Text className='title'>我的学习记录</Text><Text className='muted'>{state.mode==='wechat'?'当前显示微信账号记录。':'当前显示本机记录，仅保存在此设备。'}生词本和学习历史可以在“学习”中查看。</Text><Button onClick={()=>void Taro.switchTab({url:'/pages/index/index'})}>查看生词本与学习历史</Button></View>
  </>}
  <Button className='account-options' disabled={state.busy} onClick={()=>void options()}>账号管理</Button>
  {sheet&&<AccountSheet key={sheet==='profile'?state.identityKey:'login'} mode={sheet} onClose={()=>setSheet(null)}/>} 
 </View>;
}
