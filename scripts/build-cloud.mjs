import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {dirname,resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const packFiles=['index.cjs','index.js','package.json'];
const allowedExternals=new Set(['wx-server-sdk','sharp','node:crypto','crypto','node:buffer','buffer']);

export function validateCloudInputs(metafile,projectRoot=root){
 for(const [input,info] of Object.entries(metafile.inputs)){
  const path=relative(projectRoot,resolve(projectRoot,input)).split(sep).join('/');
  const allowed=path==='cloud-config/client.json'||['cloudfunctions/study/main/','src/shared/','src/content/','node_modules/zod/'].some(prefix=>path.startsWith(prefix));
  if(!allowed||path.split('/').some(part=>part.startsWith('.env')||part==='.data'||part==='test'||part==='tests'))throw Error('云函数包含禁止上传的源码路径');
  for(const item of info.imports??[])if(item.external&&!allowedExternals.has(item.path))throw Error('云函数包含未经允许的外部依赖：'+item.path);
 }
 if(!Object.keys(metafile.inputs).some(input=>resolve(projectRoot,input)===resolve(projectRoot,'cloudfunctions/study/main/index.ts')))throw Error('云函数入口未打包');
}

export async function validatePackDirectory(directory){
 let entries;
 try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
 if((await lstat(directory)).isSymbolicLink())throw Error('部署目录不能是符号链接');
 for(const entry of entries){
  if(!entry.isFile()||!packFiles.includes(entry.name))throw Error('部署目录含非产物文件，请检查后手动移走，不会自动删除');
 }
}

function exactVersion(value,name){if(!/^\d+\.\d+\.\d+$/.test(value??''))throw Error(name+'必须在项目package.json中固定精确版本');return value;}

export async function buildCloud(){
 const project=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
 const dependencies={
  'wx-server-sdk':exactVersion(project.dependencies?.['wx-server-sdk']??project.devDependencies?.['wx-server-sdk'],'wx-server-sdk'),
  sharp:exactVersion(project.dependencies?.sharp,'sharp')
 };
 const {build}=await import('esbuild');
 const result=await build({
  absWorkingDir:root,entryPoints:['cloudfunctions/study/main/index.ts'],outfile:'index.cjs',
  platform:'node',target:'node20.19',format:'cjs',bundle:true,write:false,metafile:true,
  external:['wx-server-sdk','sharp'],sourcemap:false,legalComments:'none',charset:'utf8',logLevel:'silent'
 });
 validateCloudInputs(result.metafile);
 if(result.outputFiles.length!==1)throw Error('云函数打包产生了预期外的文件');
 const code=result.outputFiles[0].text;
 new Script(code,{filename:'index.cjs'});
 if(/WX_APP_SECRET|jscode2session|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(code))throw Error('云函数产物混入本机认证或私钥内容，已停止写入');
 const deployment=JSON.parse(await readFile(resolve(root,'cloudbaserc.json'),'utf8'));
 const functionName=deployment.functions[0].name;
 if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,59}$/.test(functionName))throw Error('云函数名称无效');
 const directory=resolve(root,'cloudfunctions/.deploy',functionName);
 await validatePackDirectory(directory);
 await mkdir(directory,{recursive:true});
 await validatePackDirectory(directory);
 const files={
  'index.cjs':code,
  // 官方默认处理入口index.main读取index.js；核心CommonJS产物独立保留。
  'index.js':"module.exports = require('./index.cjs');\n",
  'package.json':JSON.stringify({name:'wordscape-study-cloud',version:'1.0.0',private:true,main:'index.js',engines:{node:'>=20.19.0'},dependencies},null,2)+'\n'
 };
 for(const name of packFiles)await writeFile(resolve(directory,name),files[name],'utf8');
 await validatePackDirectory(directory);
 console.log(`云函数打包通过：${packFiles.length}个文件，核心${Buffer.byteLength(code)}字节；未部署`);
 return {directory,files:packFiles};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildCloud();
