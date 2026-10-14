import path from 'node:path';
import {rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {uptime} from 'node:os';
import {createServiceManager} from '../services/manager.mjs';
import {createLogStore} from '../logs/log-store.mjs';
import {createAuth} from '../backend/auth.mjs';
import {startBackend} from '../backend/server.mjs';
import {readState,atomicState,withInstanceGuard} from './instance.mjs';
import {preparePrivateHome} from './private-dir.mjs';
import {fail} from '../core/errors.mjs';
import {createWorkspaceStore} from '../backend/workspace.mjs';
import {recoverServiceRecords} from './service-recovery.mjs';
export async function runDaemon({home,instanceId,managerFactory=options=>createServiceManager({...options,logs:createLogStore()})}){
  await preparePrivateHome(home);const lockFile=path.join(home,'backend.lock'),stateFile=path.join(home,'services.json'),instanceFile=path.join(home,'instance.json');
  await withInstanceGuard(home,async()=>{const lock=await readState(lockFile);if(!instanceId||lock?.instanceId!==instanceId)fail('BACKEND_UNAVAILABLE','后台启动锁已改变');await atomicState(lockFile,{ownerPid:process.pid,instanceId});});
  const savedRecords=await readState(stateFile)||[];if(!Array.isArray(savedRecords))fail('BACKEND_UNAVAILABLE','服务恢复记录无效');
  const initialRecords=recoverServiceRecords(savedRecords);
  if(initialRecords.length!==savedRecords.length){
    // 先保存恢复结果，再对外提供面板；项目分组和历史日志保持原样。
    await atomicState(stateFile,initialRecords);
    console.error(`[启动器] 已自动清理 ${savedRecords.length-initialRecords.length} 条已结束的服务运行记录`);
  }
  const manager=managerFactory({initialRecords,persistServices:records=>atomicState(stateFile,records.map(record=>record.status==='orphaned'?record:{...record,lastSeenSystemUptime:uptime()}))}),token=randomBytes(32).toString('hex');
  const workspaceFile=path.join(home,'workspace.json');
  const workspace=createWorkspaceStore({initialState:await readState(workspaceFile)||undefined,persist:data=>atomicState(workspaceFile,data)});
  const backend=await startBackend({manager,workspace,auth:createAuth({token}),instanceId,onShutdown:async()=>{
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
