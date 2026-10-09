import {link,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {preparePrivateHome} from './private-dir.mjs';
import {runtimeHome} from './home.mjs';
import {fail} from '../core/errors.mjs';
export async function readState(file){try{const text=await readFile(file,'utf8');if(text.length>1048576)fail('BACKEND_UNAVAILABLE','后台记录超过大小限制');return JSON.parse(text);}catch(error){if(error.code==='ENOENT')return null;fail('BACKEND_UNAVAILABLE','后台记录无效，请人工检查私有目录');}}
export async function atomicState(file,value){const tmp=`${file}.${randomUUID()}.tmp`;try{await writeFile(tmp,JSON.stringify(value),{flag:'wx',mode:0o600});await rename(tmp,file);}finally{await rm(tmp,{force:true}).catch(()=>{});}}
export function isAlive(pid){if(!Number.isInteger(pid)||pid<1)return true;try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}}
export function validateConnection(data){if(!data||!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(data.origin)||typeof data.instanceId!=='string'||!/^[a-f0-9]{64}$/.test(data.token))fail('BACKEND_UNAVAILABLE','后台连接记录无效');return data;}
export async function verifyConnection(connection,request=fetch){try{validateConnection(connection);const response=await request(connection.origin+'/api/health',{headers:{Authorization:`Bearer ${connection.token}`},signal:AbortSignal.timeout(600),redirect:'error'});const data=await response.json();return response.ok&&data.ok&&data.data.instanceId===connection.instanceId;}catch{return false;}}
export async function withInstanceGuard(home,action,{timeoutMs=10000}={}){
  const guard=path.join(home,'backend.guard'),id=randomUUID(),candidate=path.join(home,'guard-'+id+'.tmp'),until=Date.now()+timeoutMs;
  // 先写完整记录，再通过独占硬链接发布，其他进程不会读到空锁。
  await writeFile(candidate,JSON.stringify({ownerPid:process.pid,id}),{flag:'wx',mode:0o600});let acquired=false;
  try{
    while(Date.now()<until){
      try{await link(candidate,guard);acquired=true;break;}catch(error){if(error.code!=='EEXIST')throw error;}
      const owner=await readState(guard);if(owner&&!isAlive(owner.ownerPid))fail('BACKEND_UNAVAILABLE','后台交接曾被中断，请先人工检查私有目录与遗留服务；不会自动删除交接锁');
      await new Promise(resolve=>setTimeout(resolve,40));
    }
    if(!acquired)fail('BACKEND_UNAVAILABLE','等待后台实例交接超时');
    return await action();
  }finally{if(acquired)await rm(guard,{force:true});await rm(candidate,{force:true}).catch(()=>{});}
}
export async function ensureBackend({home=runtimeHome(),timeoutMs=10000,spawnBackend,isProcessAlive=isAlive,request=fetch}={}){
  await preparePrivateHome(home);const lockFile=path.join(home,'backend.lock'),instanceFile=path.join(home,'instance.json');const until=Date.now()+timeoutMs;
  let launched=false;
  while(Date.now()<until){
    const result=await withInstanceGuard(home,async()=>{
      const connection=await readState(instanceFile);if(connection&&await verifyConnection(connection,request))return validateConnection(connection);
      const lock=await readState(lockFile);
      if(lock){if(isProcessAlive(lock.ownerPid))return null;
        // 回收、创建与所有权发布在同一跨进程临界区内完成。
        await rm(lockFile,{force:true});await rm(instanceFile,{force:true});
      }
      if(launched)fail('BACKEND_UNAVAILABLE','本次后台启动未完成，请检查本机运行环境');
      const instanceId=randomUUID();await atomicState(lockFile,{ownerPid:process.pid,instanceId});launched=true;
      try{
        const child=spawnBackend?await spawnBackend({home,instanceId}):spawn(process.execPath,[fileURLToPath(new URL('../../bin/springboot-launcher.mjs',import.meta.url)),'_daemon','--home',home,'--instance-id',instanceId],{detached:true,windowsHide:true,shell:false,stdio:'ignore'});
        child.once?.('error',()=>{});child.unref?.();
        if(child.pid)await atomicState(lockFile,{ownerPid:child.pid,instanceId});
      }catch{await rm(lockFile,{force:true});fail('BACKEND_UNAVAILABLE','无法创建本机后台');}
      return null;
    },{timeoutMs:Math.max(1,until-Date.now())});
    if(result)return result;await new Promise(resolve=>setTimeout(resolve,80));
  }
  fail('BACKEND_UNAVAILABLE','后台连接超时；尚存的锁拥有者不会被终止或替换');
}
