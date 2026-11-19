import {useRef,useState} from 'react';
import {View,Text,Button,Input} from '@tarojs/components';
import type {DailyBatch} from '../shared/daily-types';
import type {StudyEvent} from '../shared/study-types';

export default function WordReview({course,events,busy,save}:{course:DailyBatch;events:StudyEvent[];busy:boolean;save:(word:string,answerText:string)=>Promise<number>}){
 const records=events.filter(e=>e.type==='recall'&&e.day===course.day&&course.words.includes(e.word||''));
 const latest=(word:string)=>records.filter(e=>e.word===word).at(-1);
 const firstCorrect=course.words.filter(word=>records.find(e=>e.word===word)?.score===1).length;
 const wrong=course.words.filter(word=>latest(word)?.score===0);
 const [round,setRound]=useState<string[]>();const [index,setIndex]=useState(0);const [answer,setAnswer]=useState('');const [feedback,setFeedback]=useState<{word:string;correct:boolean}>();const [saving,setSaving]=useState(false);const [error,setError]=useState('');
 const lock=useRef(false);const queue=round||course.words.filter(word=>!latest(word));const word=queue[index];
 async function submit(value=answer){if(!word||lock.current||busy)return;lock.current=true;setSaving(true);setError('');try{const score=await save(word,value);setFeedback({word,correct:score===1});}catch(e){setError(e instanceof Error?e.message:'保存巩固记录失败');}finally{lock.current=false;setSaving(false);}}
 function next(){setAnswer('');setFeedback(undefined);if(round)setIndex(index+1);}
 return <View className='card'><Text className='title'>第{course.day}天 · 单词巩固</Text><Text className='muted'>看释义，独立写出本日目标词。提交后再查看答案。</Text>
  <Text className='muted'>已练 {new Set(records.map(e=>e.word)).size}/{course.words.length} 词 · 首次独立答对 {firstCorrect} 词 · 待巩固 {wrong.length} 词</Text>
  {error&&<View className='error'>{error}</View>}
  {feedback?<><Text className='title'>{feedback.correct?'回答正确 ✓':'再记一次'}</Text><Text className='english'>{feedback.word}</Text><Text>{course.content.targets[feedback.word].ipa}</Text><Text className='translation'>{course.content.targets[feedback.word].meaning}</Text><Button disabled={busy||saving} onClick={next}>下一词</Button></>:word?<><Text className='title'>{course.content.targets[word].meaning}</Text><Input className='review-answer' value={answer} placeholder='输入英文单词' disabled={busy||saving} onInput={e=>setAnswer(e.detail.value)} onConfirm={()=>void submit()}/><Button disabled={busy||saving||!answer.trim()} onClick={()=>void submit()}>{saving?'正在保存…':'提交答案'}</Button><Button disabled={busy||saving} onClick={()=>void submit('')}>想不起来，查看答案</Button></>:<><Text className='title'>本轮练习完成</Text><Text className='muted'>巩固记录单独保存，不影响阅读和测验的完成状态。</Text>{wrong.length>0&&<Button disabled={busy} onClick={()=>{setRound([...wrong]);setIndex(0);setAnswer('');}}>再练错词（{wrong.length}）</Button>}<Button disabled={busy} onClick={()=>{setRound([...course.words]);setIndex(0);setAnswer('');}}>重练全部单词</Button></>}
 </View>;
}
