import path from 'node:path';
import {rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createServiceManager} from '../services/manager.mjs';
import {createLogStore} from '../logs/log-store.mjs';
import {createAuth} from '../backend/auth.mjs';
import {startBackend} from '../backend/server.mjs';
import {readState,atomicState,withInstanceGuard} from './instance.mjs';
import {preparePrivateHome} from './private-dir.mjs';
import {fail} from '../core/errors.mjs';
export async function runDaemon({home,instanceId,managerFactory=options=>createServiceManager({...options,logs:createLogStore()})}){
  await preparePrivateHome(home);const lockFile=path.join(home,'backend.lock'),stateFile=path.join(home,'services.json'),instanceFile=path.join(home,'instance.json');
  await withInstanceGuard(home,async()=>{const lock=await readState(lockFile);if(!instanceId||lock?.instanceId!==instanceId)fail('BACKEND_UNAVAILABLE','后台启动锁已改变');await atomicState(lockFile,{ownerPid:process.pid,instanceId});});
  const initialRecords=await readState(stateFile)||[];if(!Array.isArray(initialRecords))fail('BACKEND_UNAVAILABLE','服务恢复记录无效');
  const manager=managerFactory({initialRecords,persistServices:records=>atomicState(stateFile,records)}),token=randomBytes(32).toString('hex');
  const backend=await startBackend({manager,auth:createAuth({token}),instanceId,onShutdown:async()=>{
    await withInstanceGuard(home,async()=>{
      const owned=await readState(lockFile);if(owned?.instanceId===instanceId){
        // 正常退出不等于人工遗忘；未确认的旧 JVM 保护必须跨后台保留。
        await atomicState(stateFile,(await manager.list()).filter(record=>record.status==='orphaned'));
        await rm(instanceFile,{force:true});await rm(lockFile,{force:true});
      }
    });
  }});
  try{await withInstanceGuard(home,async()=>{const current=await readState(lockFile);if(current?.instanceId!==instanceId)fail('BACKEND_UNAVAILABLE','后台启动期间锁已更换');await atomicState(instanceFile,{origin:backend.origin,instanceId,token});});}catch(error){await backend.close();throw error;}
  // 普通代理退出不触发这里。退出入口通过 manager 拒绝仍有服务的关闭请求。
  return backend;
}
