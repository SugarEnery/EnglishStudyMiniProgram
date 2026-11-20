import {useState} from 'react';
import {View,Text,Button} from '@tarojs/components';
import type {DailyBatch} from '../shared/daily-types';

type Question=DailyBatch['content']['lessons'][number]['questions'][number];
export default function ContextQuiz({questions,answers,setAnswers,submitted,busy,submit,restart}:{questions:Question[];answers:number[];setAnswers:(answers:number[])=>void;submitted:boolean;busy:boolean;submit:()=>void;restart:()=>void}){
 const [index,setIndex]=useState(0);const [checked,setChecked]=useState<number[]>([]);
 const question=questions[index];const revealed=submitted||checked.includes(index);const chosen=answers[index];
 return <View className='card context-quiz'><Text className='title'>情景辨词</Text><Text className='muted'>第 {index+1}/{questions.length} 题 · 理解这个词在情景中的意思和用法</Text>
  <Text className='word-chip'>{question.word}</Text><Text className='quiz-prompt'>{question.prompt}</Text>
  {question.options.map((option,j)=><Button key={j} disabled={busy||revealed} className={`option ${chosen===j?'chosen':''} ${revealed?(j===question.answer?'correct':chosen===j?'wrong':''):''}`} onClick={()=>{const next=answers.slice();next[index]=j;setAnswers(next);}}>{String.fromCharCode(65+j)}. {option}</Button>)}
  {revealed&&<Text className='translation'>{chosen===question.answer?'✓ 理解正确':'正确答案：'+String.fromCharCode(65+question.answer)} · {question.explanation}</Text>}
  {!revealed&&<Button className='primary-button' disabled={busy||!Number.isInteger(chosen)} onClick={()=>setChecked([...checked,index])}>确认答案</Button>}
  <View className='row'>{index>0&&<Button size='mini' disabled={busy} onClick={()=>setIndex(index-1)}>上一题</Button>}{revealed&&index<questions.length-1&&<Button size='mini' disabled={busy} onClick={()=>setIndex(index+1)}>下一题</Button>}</View>
  {!submitted&&checked.length===questions.length&&<Button className='primary-button' disabled={busy} onClick={submit}>完成并保存本组</Button>}
  {submitted&&<><Text className='muted'>本组已保存 · {questions.filter((q,i)=>answers[i]===q.answer).length}/{questions.length} 题正确</Text><Button disabled={busy} onClick={()=>{restart();setChecked([]);setIndex(0);}}>重新练习</Button></>}
 </View>;
}
