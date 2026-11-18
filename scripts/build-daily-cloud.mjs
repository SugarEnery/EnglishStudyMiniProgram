import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {dirname,resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const files=['index.cjs','index.js','package.json','config.json'];
function exact(value,name){if(!/^\d+\.\d+\.\d+$/.test(value??''))throw Error(`${name}必须固定精确版本`);return value;}
async function validateDirectory(directory){
 let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
 if((await lstat(directory)).isSymbolicLink())throw Error('每日内容部署目录不能是符号链接');for(const entry of entries)if(!entry.isFile()||!files.includes(entry.name))throw Error('每日内容部署目录含预期外文件');
}
export async function buildDailyCloud(){
 const project=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));const dependencies={'wx-server-sdk':exact(project.dependencies['wx-server-sdk']??project.devDependencies['wx-server-sdk'],'wx-server-sdk'),'tencentcloud-sdk-nodejs-tts':exact(project.dependencies['tencentcloud-sdk-nodejs-tts'],'TTS SDK')};
 const {build}=await import('esbuild');const result=await build({absWorkingDir:root,entryPoints:['cloudfunctions/daily-content/main/index.ts'],outfile:'index.cjs',platform:'node',target:'node20.19',format:'cjs',bundle:true,write:false,metafile:true,external:Object.keys(dependencies),sourcemap:false,legalComments:'none',charset:'utf8',logLevel:'silent'});
 for(const input of Object.keys(result.metafile.inputs)){const path=relative(root,resolve(root,input)).split(sep).join('/');if(!path.startsWith('cloudfunctions/daily-content/main/')&&!path.startsWith('src/shared/daily-content')&&!path.startsWith('node_modules/zod/'))throw Error(`每日内容云函数包含未经允许的源码：${path}`);}
 if(result.outputFiles.length!==1)throw Error('每日内容云函数产物数量无效');const code=result.outputFiles[0].text;new Script(code,{filename:'index.cjs'});if(/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(code))throw Error('每日内容云函数产物包含私钥');
 const directory=resolve(root,'cloudfunctions/.deploy/daily-content');await validateDirectory(directory);await mkdir(directory,{recursive:true});const output={'index.cjs':code,'index.js':"module.exports = require('./index.cjs');\n",'package.json':JSON.stringify({name:'wordscape-daily-content',version:'1.0.0',private:true,main:'index.js',engines:{node:'>=20.19.0'},dependencies},null,2)+'\n','config.json':JSON.stringify({triggers:[{name:'generate-next-day-at-3am',type:'timer',config:'0 0 3 * * * *'}]},null,2)+'\n'};
 for(const name of files)await writeFile(resolve(directory,name),output[name],'utf8');await validateDirectory(directory);console.log(`每日内容云函数打包通过：${files.length}个文件，核心${Buffer.byteLength(code)}字节；未部署`);return {directory,files};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildDailyCloud();
