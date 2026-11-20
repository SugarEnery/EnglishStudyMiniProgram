import {useEffect,useRef,useState} from 'react';
import ContextQuiz from './ContextQuiz';
import type {Lesson} from '../shared/daily-types';
import type {StudyEvent} from '../shared/study-types';

export default function ContextQuizModule({lesson,event,busy,save}:{lesson:Lesson;event?:StudyEvent;busy:boolean;save:(answers:number[])=>Promise<boolean>}){
 const [answers,setAnswers]=useState<number[]>(event?.answers??[]);
 const [submitted,setSubmitted]=useState(Boolean(event));
 const restored=useRef(event?.id);
 useEffect(()=>{if(restored.current!==event?.id){restored.current=event?.id;setAnswers(event?.answers??[]);setSubmitted(Boolean(event));}},[event]);
 return <ContextQuiz questions={lesson.contextQuestions!} answers={answers} setAnswers={setAnswers} submitted={submitted} busy={busy} submit={()=>void save(answers).then(saved=>{if(saved)setSubmitted(true);})} restart={()=>{setAnswers([]);setSubmitted(false);}}/>;
}
