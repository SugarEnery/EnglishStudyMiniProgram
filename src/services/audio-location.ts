/** 按已部署的真实云存储根目录映射音频，不猜测环境或桶名。 */
export function audioLocation(path:string,cloudBackend:boolean,storageRoot:string,apiBase:string){
 if(!/^\/audio\/en-GB\/v[1-9]\d*\/[a-f0-9]{64}\.mp3$/.test(path))throw Error('音频清单路径无效');
 if(!cloudBackend)return apiBase+path;
 if(!storageRoot)throw Error('尚未配置音频云存储，请填写MINIAPP_CLOUD_STORAGE_ROOT后重新编译');
 if(!/^cloud:\/\/[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/.test(storageRoot))throw Error('音频云存储根目录无效，应为实际cloud://环境ID.存储桶且不含末尾斜杠');
 return storageRoot+path;
}
