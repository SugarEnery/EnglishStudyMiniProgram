import cloud from 'wx-server-sdk';
import {businessEvent} from './platform-event';
import {createRepository,type NativeDatabase} from './repository';
import {createStudyService} from './service';
import cloudClient from '../../../cloud-config/client.json';
// SDK 4.0.2运行时官方提供symbol环境值，但其ICloudConfig.env声明遗漏symbol；此处只适配该边界。
const currentEnvironment={env:cloud.DYNAMIC_CURRENT_ENV} as unknown as Parameters<typeof cloud.init>[0];
cloud.init(currentEnvironment);
// SDK 4.0.2的DocumentReference.get实现读取此开关；其IDatabaseConfig声明尚未列出。
const databaseOptions:NonNullable<Parameters<typeof cloud.database>[0]>&{throwOnNotFound:false}={throwOnNotFound:false};
const database=cloud.database(databaseOptions);
const service=createStudyService(createRepository(database as unknown as NativeDatabase),{
 // SDK 4.0.2 上传成功时可能返回 statusCode=-1，fileID 才是可用结果的可靠标志。
 upload:async(cloudPath,fileContent)=>{const result=await cloud.uploadFile({cloudPath,fileContent});if(!result.fileID)throw Error('头像上传失败：云存储未返回文件标识');return result.fileID;},
 download:async fileID=>{const result=await cloud.downloadFile({fileID});if((result.statusCode!==200&&result.statusCode!==0)||!Buffer.isBuffer(result.fileContent))throw Error('私有头像读取失败');return result.fileContent;},
},{audioStorageRoot:cloudClient.storageRoot,reportError:(error:unknown)=>{const detail=error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:String(error);cloud.logger().error({message:'学习云函数内部错误',detail});}});
export async function main(event:unknown){return service.handle(businessEvent(event),cloud.getWXContext().OPENID);}
