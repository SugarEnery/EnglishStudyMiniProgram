import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url), source=new URL('../../wordscape/',import.meta.url);
await mkdir(new URL('src/content/',root),{recursive:true});
const files=['daily-types.ts','daily-validation.ts','lexical.ts','oxford-wordlist.json'];
// 保留小程序独立原创课程的来源记录，只同步下列网站原始文件。
const hashes=JSON.parse(await readFile(new URL('docs/content-provenance.json',root),'utf8'));
for(const name of files){const bytes=await readFile(new URL('lib/'+name,source));await writeFile(new URL('src/shared/'+name,root),bytes);hashes[name]=createHash('sha256').update(bytes).digest('hex');}
await writeFile(new URL('docs/content-provenance.json',root),JSON.stringify(hashes,null,2)+'\n');
console.log('课程及共享逻辑已同步，未修改网站');
