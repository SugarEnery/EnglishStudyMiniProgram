import * as plans from './personal-plan';
import Taro from '@tarojs/taro';
import {useEffect,useSyncExternalStore} from 'react';
import * as profiles from './profile';
import * as study from './study';
import {createSessionController} from '../shared/session-controller';
import {sessionStorageKey} from './cloud-protocol';
const storageKey=sessionStorageKey(CLOUD_BACKEND,CLOUD_ENV_ID,API_BASE);
export const session=createSessionController({
 loadPlan:plans.loadPlan,createPlan:plans.createPlan,updatePlan:plans.updatePlan,
 read:()=>Taro.getStorageSync(storageKey),write:value=>Taro.setStorageSync(storageKey,value),
 loadProfile:profiles.loadProfile,updateProfile:profiles.updateProfile,uploadAvatar:profiles.uploadAvatar,
 activate:study.activateSession,login:study.loginSession,revoke:study.revokeSession,days:study.days,events:study.events,save:study.save,
 isExpired:error=>error instanceof study.SessionExpiredError,now:Date.now,newId:study.newId,
});
export function useStudySession(){
 const snapshot=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot);
 useEffect(()=>{void session.initialize().catch(()=>{});},[]);
 return snapshot;
}
