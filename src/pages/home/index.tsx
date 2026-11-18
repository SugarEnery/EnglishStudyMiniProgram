import {View,Text,Button} from '@tarojs/components';
import Taro,{useDidShow} from '@tarojs/taro';
import {useState} from 'react';
import {session,useStudySession} from '../../services/session';
import {playAudio} from '../../services/audio';
import {studyOverview} from '../../shared/dashboard';
import type {DailyContent} from '../../shared/daily-content';
import {loadDailyContent} from '../../services/daily-content';
export default function Home(){
 const state=useStudySession();
 const [translationVisible,setTranslationVisible]=useState(false);
 const [sentencePlaying,setSentencePlaying]=useState(false);
 const [sentence,setSentence]=useState<DailyContent|null>(null);
 const [sentenceLoading,setSentenceLoading]=useState(true);
 const [sentenceError,setSentenceError]=useState('');
 async function refreshSentence(){setSentenceLoading(true);setSentenceError('');try{setSentence(await loadDailyContent());setTranslationVisible(false);}catch(error){setSentence(null);setSentenceError(error instanceof Error?error.message:'今日内容读取失败');}finally{setSentenceLoading(false);}}
 useDidShow(()=>{void refreshSentence();if(session.getSnapshot().mode!=='local')void session.refreshCalendar();});
 const overview=studyOverview(state.days,state.events);
 const reportAudioError=(message:string)=>Taro.showToast({title:message,icon:'none',duration:2600});
 return <View className='page'>
  <Text className='brand'>WORDSCAPE · 每日英语</Text>
  <Text className='heading'>每天一点，读懂更多</Text>
  <Text className='muted'>用真实情境记单词，让阅读成为每天的小习惯。</Text>
  <View className='card hero-card'><Text className='eyebrow'>每日一句</Text>{sentenceLoading?<Text className='muted'>正在读取今日内容…</Text>:sentenceError?<><Text className='error'>{sentenceError}</Text><Button onClick={()=>void refreshSentence()}>重新读取</Button></>:sentence&&<><Text className='english'>{sentence.english}</Text>{translationVisible&&<Text className='translation'>{sentence.chinese}</Text>}<View className='daily-sentence-actions'><Button className='daily-audio-button' disabled={sentencePlaying} onClick={()=>playAudio(`daily:${sentence.date}`,reportAudioError,setSentencePlaying)}>{sentencePlaying?<View className='audio-playing-state'><View className='audio-playing-icon'><Text/><Text/><Text/></View><Text>正在播放</Text></View>:'播放英文发音'}</Button><Button onClick={()=>setTranslationVisible(value=>!value)}>{translationVisible?'隐藏译文':'查看译文'}</Button></View></>}</View>
  {state.mode!=='local'&&state.ready&&<>
   <View className='card hero-card'><Text className='eyebrow'>我的学习计划</Text><Text className='heading'>{state.plan?'每天'+state.plan.wordsPerDay+'词':'每天学多少，由你选择'}</Text><Text className='muted'>{state.plan?'查看每日单词安排和已准备好的课程。':'开始前选择每日10～80词，预览天数后保存计划。'}</Text><Button className='primary-button' onClick={()=>void Taro.switchTab({url:'/pages/plan/index'})}>{state.plan?'查看我的计划':'设置并开始计划'}</Button></View>
   <View className='overview-grid'>
    <View className='metric'><Text className='metric-value'>{overview.completedDays}</Text><Text className='muted'>完成天数</Text></View>
    <View className='metric'><Text className='metric-value'>{overview.completedWords}</Text><Text className='muted'>完成新词</Text></View>
    <View className='metric'><Text className='metric-value'>{overview.readLessons}</Text><Text className='muted'>读完情境</Text></View>
   </View>
  </>}
  {state.mode==='local'&&<View className='card'><Text className='title'>登录后保存账号记录</Text><Text className='muted'>本机与账号记录分开保存，本机记录不会自动上传。到“我的”登录后，可同步账号的学习记录和计划。</Text><Button onClick={()=>void Taro.switchTab({url:'/pages/profile/index'})}>前往我的</Button></View>}
 </View>;
}
