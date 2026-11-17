import {useState} from 'react';
import {View,Text,Button,Input,Image,PageContainer} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {session,useStudySession} from '../services/session';

export type AccountSheetMode='login'|'profile';

export default function AccountSheet({mode,onClose}:{mode:AccountSheetMode;onClose:()=>void}){
 const state=useStudySession();const [open,setOpen]=useState(true);const [saving,setSaving]=useState(false);
 const initialName=state.account?.profile.nickName||'';
 const [nickName,setNickName]=useState(initialName);const [avatar,setAvatar]=useState('');const [approved,setApproved]=useState(false);const [review,setReview]=useState('');
 const busy=state.busy||saving;const changedName=nickName!==initialName;
 const canSave=Boolean(avatar||changedName)&&(!changedName||(Boolean(nickName.trim())&&approved));
 async function login(){
  if(busy)return;setSaving(true);
  try{await session.login();await Taro.showToast({title:'登录成功',icon:'success'});setOpen(false);}catch{/* 保留弹窗与共享错误，可直接重试。 */}finally{setSaving(false);}
 }
 async function save(){
  if(busy||!canSave)return;setSaving(true);
  try{
   if(avatar){await session.uploadAvatar(avatar);setAvatar('');}
   if(changedName)await session.updateProfile(nickName);
   await Taro.showToast({title:'资料已保存',icon:'success'});setOpen(false);
  }catch{/* 已保存的头像保留，失败项继续显示并可重试。 */}finally{setSaving(false);}
 }
 return <PageContainer show={open} position='bottom' round overlay closeOnSlideDown={false} onClickOverlay={()=>{if(!busy)setOpen(false);}} onAfterLeave={onClose}>
  <View className='account-sheet'>
   <View className='row'><Text className='title'>{mode==='profile'?'头像与昵称':'微信登录'}</Text><Button className='sheet-close' ariaLabel='关闭弹窗' disabled={busy} onClick={()=>setOpen(false)}>×</Button></View>
   {mode==='login'?<>
    <View className='sheet-mark'>W</View><Text className='sheet-caption'>登录后，学习记录跟着你</Text>
    <Text className='muted sheet-copy'>使用微信账号同步学习进度和每日计划。本机记录不会覆盖账号记录。</Text>
    {state.error&&<View className='error'>{state.error}</View>}
    <Button className='wechat-login-button' loading={busy} disabled={busy} onClick={()=>void login()}>{busy?'正在登录':'微信登录并继续'}</Button>
    <Button className='sheet-secondary' disabled={busy} onClick={()=>setOpen(false)}>暂不登录</Button>
   </>:<>
    <Text className='muted sheet-copy'>头像和昵称是可选资料，不影响登录和学习。</Text>
    <View className='user-id-row'><Text className='muted'>用户ID：{state.account?.profile.userId}</Text><Button size='mini' disabled={!state.account?.profile.userId} onClick={()=>void Taro.setClipboardData({data:state.account!.profile.userId})}>复制</Button></View>
    <Button className='avatar-picker' openType='chooseAvatar' disabled={busy} onChooseAvatar={event=>setAvatar(event.detail.avatarUrl)}>
     {avatar||state.account?.avatarPath?<Image className='sheet-avatar' src={avatar||state.account!.avatarPath} mode='aspectFill'/>:<View className='sheet-avatar sheet-avatar-placeholder'>W</View>}
     <Text>使用微信头像或上传图片</Text>
    </Button>
    <Input className='profile-input' type='nickname' placeholder='使用微信昵称或自己填写' maxlength={40} value={nickName} disabled={busy} onInput={event=>{setNickName(event.detail.value);setApproved(false);setReview('');}} onBlur={event=>{if(event.detail.value!==nickName)setApproved(false);setNickName(event.detail.value);}} onNickNameReview={event=>{setApproved(event.detail.pass===true);setReview(event.detail.pass?'':event.detail.timeout?'昵称审核超时，请重新填写':'昵称未通过审核，请重新填写');}} />
    {review&&<Text className='error'>{review}</Text>}
    {state.error&&<View className='error'>{state.error}</View>}
    <Button className='primary-button' loading={busy} disabled={busy||!canSave} onClick={()=>void save()}>保存资料</Button>
    <Button className='sheet-secondary' disabled={busy} onClick={()=>setOpen(false)}>暂不修改</Button>
   </>}
  </View>
 </PageContainer>;
}

