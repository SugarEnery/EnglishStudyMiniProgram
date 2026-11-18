export const collections={sessions:'wordscape_sessions',events:'wordscape_events',plans:'wordscape_plans',profiles:'wordscape_profiles',dailySentences:'daily_sentences'} as const;
export type Collection=typeof collections[keyof typeof collections];
export type Document=Record<string,unknown>;
export interface Transaction{
 get(collection:Collection,id:string):Promise<unknown|null>;
 set(collection:Collection,id:string,value:Document):Promise<void>;
 remove(collection:Collection,id:string):Promise<void>;
}
export interface Repository{
 transaction<T>(action:(tx:Transaction)=>Promise<T>):Promise<T>;
 eventPage(owner:string,after:number,limit:number):Promise<unknown[]>;
}
export interface Storage{
 upload(path:string,bytes:Buffer):Promise<string>;
 download(fileID:string):Promise<Buffer>;
}

type NativeDoc={get:()=>Promise<{data:Document|null}>;set:(input:{data:Document})=>Promise<unknown>;remove:()=>Promise<unknown>};
type NativeTransaction={collection:(name:string)=>{doc:(id:string)=>NativeDoc}};
type NativeQuery={where:(query:Document)=>NativeQuery;orderBy:(field:string,direction:string)=>NativeQuery;limit:(limit:number)=>NativeQuery;get:()=>Promise<{data:Document[]}>};
export type NativeDatabase=NativeTransaction&{command:{gt:(value:number)=>unknown};collection:((name:string)=>{doc:(id:string)=>NativeDoc})&((name:string)=>NativeQuery);runTransaction:<T>(action:(tx:NativeTransaction)=>Promise<T>)=>Promise<T>};
function clean(value:Document){const {_id,_openid,...data}=value;return data;}
export function createRepository(database:NativeDatabase):Repository{
 return {
  transaction:action=>database.runTransaction(async native=>action({
   get:async(collection,id)=>{const result=await native.collection(collection).doc(id).get();return result.data?clean(result.data):null;},
   set:async(collection,id,data)=>{await native.collection(collection).doc(id).set({data});},
   remove:async(collection,id)=>{await native.collection(collection).doc(id).remove();},
  })),
  eventPage:async(owner,after,limit)=>{
   const query=database.collection(collections.events) as unknown as NativeQuery;
   const result=await query.where({owner,sequence:database.command.gt(after)}).orderBy('sequence','asc').limit(limit).get();return result.data.map(clean);
  },
 };
}
