import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDailyContent,promptFor,type GeneratorDependencies,type PublishedDailyContent} from '../cloudfunctions/daily-content/main/generator';

const valid=JSON.stringify({english:'A careful learner notices one useful detail and applies it during an ordinary conversation.',chinese:'一位认真的学习者发现一个有用的细节，并把它运用到日常对话中。'});
function setup(overrides:Partial<GeneratorDependencies>={}){
 let published:PublishedDailyContent|undefined,failed='';const mp3=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(128)]);
 const dependencies:GeneratorDependencies={claim:async()=>'claimed',recentEnglish:async()=>[],generateText:async()=>valid,synthesize:async()=>mp3,upload:async()=>`cloud://test/daily.mp3`,publish:async(_,row)=>{published=row;},fail:async(_,message)=>{failed=message;},now:()=>123,model:'hy4',voiceType:101050,...overrides};
 return {dependencies,published:()=>published,failed:()=>failed};
}
test('每日生成只有文本、译文、MP3全部成功才发布',async()=>{const f=setup();assert.equal(await generateDailyContent('2026-11-19',f.dependencies),'published');assert.equal(f.published()?.model,'hy4');assert.equal(f.published()?.voiceType,101050);assert.equal(f.failed(),'');});
test('重复、非纯JSON和损坏音频明确失败且不发布',async()=>{
 for(const overrides of [{recentEnglish:async()=>[JSON.parse(valid).english]},{generateText:async()=>`\`\`\`json\n${valid}\n\`\`\``},{synthesize:async()=>Buffer.from('bad')}]){const f=setup(overrides);await assert.rejects(generateDailyContent('2026-11-19',f.dependencies));assert.equal(f.published(),undefined);assert.ok(f.failed());}
});
test('已发布或正在生成的日期不重复调用模型',async()=>{for(const state of ['published','busy'] as const){let calls=0;const f=setup({claim:async()=>state,generateText:async()=>{calls++;return valid;}});assert.equal(await generateDailyContent('2026-11-19',f.dependencies),state);assert.equal(calls,0);}});
test('提示词限定纯JSON、日期、长度和近期去重',()=>{const prompt=promptFor('2026-11-19',['recent']);assert.match(prompt,/只返回一个JSON对象/);assert.match(prompt,/2026-11-19/);assert.match(prompt,/12至50/);assert.match(prompt,/recent/);});
