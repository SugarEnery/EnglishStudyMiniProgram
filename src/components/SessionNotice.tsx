import {View,Text} from '@tarojs/components';
import {useStudySession} from '../services/session';
export default function SessionNotice(){
 const state=useStudySession();
 return <View>
  {state.error&&<View className='error'>{state.error}</View>}
  {state.busy&&<Text className='muted'>正在同步学习信息…</Text>}
  {!state.ready&&!state.busy&&state.error&&<Text className='muted'>暂时无法读取学习信息，请到“我的”重试或重新登录。</Text>}
 </View>;
}
