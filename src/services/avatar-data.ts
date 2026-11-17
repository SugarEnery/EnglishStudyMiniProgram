const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const pngSignature=[137,80,78,71,13,10,26,10];
/** 校验云函数返回的有界PNG数据，避免把任意响应写入本机文件。 */
export function avatarFileData(value:unknown,version:unknown){
 if(typeof version!=='string'||!/^[a-f0-9]{64}$/.test(version))throw Error('头像版本无效，请刷新重试');
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!('base64' in value)||typeof value.base64!=='string')throw Error('云端头像数据格式错误');
 const base64=value.base64;
 if(base64.length>699052)throw Error('云端头像超过512KiB限制');
 if(!base64||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))throw Error('云端头像编码无效');
 const padding=base64.endsWith('==')?2:base64.endsWith('=')?1:0;
 if(base64.length/4*3-padding>512*1024)throw Error('云端头像超过512KiB限制');
 if((padding===2&&(alphabet.indexOf(base64[base64.length-3])&15)!==0)||(padding===1&&(alphabet.indexOf(base64[base64.length-2])&3)!==0))throw Error('云端头像编码无效');
 const signature:number[]=[];let bits=0,accumulator=0;
 for(const char of base64.slice(0,12)){if(char==='=')break;accumulator=(accumulator<<6)|alphabet.indexOf(char);bits+=6;if(bits>=8){bits-=8;signature.push((accumulator>>>bits)&255);}}
 if(!pngSignature.every((byte,index)=>signature[index]===byte))throw Error('云端头像不是PNG图片');
 return {base64,fileName:`wordscape-avatar-${version}.png`};
}
