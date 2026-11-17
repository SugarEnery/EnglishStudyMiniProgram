import { defineConfig } from '@tarojs/cli';
import cloudDeployment from '../cloudbaserc.json';
import cloudClient from '../cloud-config/client.json';
const backend=process.env.MINIAPP_BACKEND??'cloud';
if(!['cloud','http'].includes(backend))throw Error('MINIAPP_BACKEND仅支持cloud或http');
export default defineConfig({
 projectName:'wordscape-weapp',date:'2026-10-20',designWidth:750,deviceRatio:{750:1},sourceRoot:'src',outputRoot:'dist',
 framework:'react',compiler:'webpack5',plugins:['@tarojs/plugin-platform-weapp'],
 defineConstants:{API_BASE:JSON.stringify(process.env.MINIAPP_API_BASE || 'http://127.0.0.1:8788'),CLOUD_BACKEND:JSON.stringify(backend==='cloud'),CLOUD_ENV_ID:JSON.stringify(process.env.MINIAPP_CLOUD_ENV_ID??cloudDeployment.envId),CLOUD_STORAGE_ROOT:JSON.stringify(process.env.MINIAPP_CLOUD_STORAGE_ROOT??cloudClient.storageRoot)},
 mini:{postcss:{pxtransform:{enable:true},cssModules:{enable:false}}}
});
