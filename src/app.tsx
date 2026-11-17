import type {PropsWithChildren} from 'react';
import {useLaunch} from '@tarojs/taro';
import {ensureCloud} from './services/cloud';
import './app.css';
export default function App({children}:PropsWithChildren){
 useLaunch(()=>{if(CLOUD_BACKEND&&CLOUD_ENV_ID.trim())ensureCloud();});
 return children;
}
