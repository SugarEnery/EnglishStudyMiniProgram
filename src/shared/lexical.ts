export function normalizeWord(word:string){return word.toLowerCase().replaceAll('’',"'")}
function escape(word:string){return word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
export function includesWord(text:string,word:string){return new RegExp('\\b'+escape(normalizeWord(word))+'\\b','i').test(normalizeWord(text))}
export function readingParts(text:string,targets:string[]){
 const phrases=targets.filter(w=>/[^a-z]/i.test(w)).sort((a,b)=>b.length-a.length).map(w=>'\\b'+escape(w).replaceAll("'","['’]")+'\\b');
 return text.split(new RegExp('('+[...phrases,"[A-Za-z]+(?:['’][A-Za-z]+)*"].join('|')+')','gi'));
}
