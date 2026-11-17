import list from './oxford-wordlist.json';

export const START_DATE='2026-10-14';
export const WORDS_PER_DAY=30;
export const PLAN_VERSION='all-words-shuffle-v2';

function stableHash(value:string){
 let hash=2166136261;
 for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);
 return hash>>>0;
}

const normalizedWords=list.words.map(entry=>({...entry,word:entry.word.toLowerCase().replaceAll('’',"'")}));
// 固定种子的Fisher–Yates洗牌：全部词参与，第1天没有特殊保留。
function shuffledWords(){
 const words=[...normalizedWords];let state=stableHash(PLAN_VERSION);
 const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 for(let i=words.length-1;i>0;i--){const range=i+1;const limit=Math.floor(0x100000000/range)*range;let draw;do{draw=next();}while(draw>=limit);const j=draw%range;[words[i],words[j]]=[words[j],words[i]];}
 return words;
}
export const planWords=shuffledWords();
export const plan={totalWords:planWords.length,totalDays:Math.ceil(planWords.length/WORDS_PER_DAY),startDate:START_DATE,wordsPerDay:WORDS_PER_DAY,version:PLAN_VERSION};

export function wordsForDay(day:number){
 if(!Number.isInteger(day)||day<1)return [];
 return planWords.slice((day-1)*WORDS_PER_DAY,day*WORDS_PER_DAY).map(entry=>entry.word);
}
export function dateForDay(day:number){return new Date(Date.parse(START_DATE+'T00:00:00Z')+(day-1)*86400000).toISOString().slice(0,10)}
export function today(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-')}
