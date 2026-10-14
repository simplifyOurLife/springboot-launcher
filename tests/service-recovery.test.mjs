import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {uptime} from 'node:os';
import {fixture} from './helpers/project-fixtures.mjs';
import {normalizeProjectDir} from '../src/project/paths.mjs';
import {createLogStore} from '../src/logs/log-store.mjs';
import {createServiceManager} from '../src/services/manager.mjs';
import {runDaemon} from '../src/runtime/daemon.mjs';
import {preparePrivateHome} from '../src/runtime/private-dir.mjs';
import {atomicState} from '../src/runtime/instance.mjs';
import {recoverServiceRecords} from '../src/runtime/service-recovery.mjs';

test('后台恢复自动清理已退出和上次开机的记录，保留存活与无法核实的进程',async t=>{
  const f=await fixture(),home=path.join(f.root,'恢复后台');let backend,manager;
  t.after(async()=>{await manager?.shutdown({stopServices:true});await backend?.close();await f.cleanup();});
  await preparePrivateHome(home);
  // 真实创建再等待进程退出，验证恢复逻辑，而非硬编码一个假定不存在的 PID。
  const {stdout}=await promisify(execFile)(process.execPath,['-e','console.log(process.pid)'],{windowsHide:true});
  const stoppedPid=Number(stdout.trim()),now=new Date().toISOString(),ids={};
  for(const name of ['exited','rebooted','alive','unknown']){
    const dir=path.join(f.dir,name);await mkdir(dir);ids[name]=await normalizeProjectDir(dir);
  }
  const oldLog=path.join(f.root,'旧服务.log');await writeFile(oldLog,'旧日志保留');
  await atomicState(path.join(home,'backend.lock'),{ownerPid:process.pid,instanceId:'recovery-test'});
  await atomicState(path.join(home,'services.json'),[
    {...ids.exited,pid:stoppedPid,status:'orphaned',startedAt:now,logPath:oldLog},
    // 模拟重启后 PID 被复用；当前测试进程必须保持运行，不能被接管或停止。
    {...ids.rebooted,pid:process.pid,status:'running',startedAt:'2000-01-01T00:00:00.000Z',lastSeenSystemUptime:uptime()+86400},
    {...ids.alive,pid:process.pid,status:'running',startedAt:now},
    {...ids.unknown,pid:null,status:'starting',startedAt:now}
  ]);
  backend=await runDaemon({home,instanceId:'recovery-test',managerFactory:options=>{
    manager=createServiceManager({...options,logs:createLogStore(),probePort:async()=>false,
      prepareLaunch:async request=>({...ids.exited,dir:request.dir,executable:process.execPath,args:['-e','setInterval(()=>{},1000)'],mode:'classpath',port:null})});
    return manager;
  }});
  for(const name of ['exited','rebooted']){
    const state=await manager.status(ids[name].dir);
    assert.equal(state.status,'stopped',`${name} 不应再要求人工确认`);assert.equal(state.pid,null);
  }
  for(const name of ['alive','unknown']){
    assert.equal((await manager.status(ids[name].dir)).status,'orphaned');
    await assert.rejects(manager.start({dir:ids[name].dir}),{code:'ORPHANED_SERVICE'});
  }
  const saved=JSON.parse(await readFile(path.join(home,'services.json'),'utf8'));
  assert.deepEqual(saved.map(record=>record.projectKey).sort(),[ids.alive.projectKey,ids.unknown.projectKey].sort());
  assert.equal(await readFile(oldLog,'utf8'),'旧日志保留');assert.equal(process.kill(process.pid,0),true);
  await manager.start({dir:ids.exited.dir});
  const runningSaved=JSON.parse(await readFile(path.join(home,'services.json'),'utf8')).find(record=>record.projectKey===ids.exited.projectKey);
  assert.ok(Number.isFinite(runningSaved.lastSeenSystemUptime),'新托管记录必须保留不受校时影响的系统运行时长');
  assert.equal((await manager.stop(ids.exited.dir)).status,'stopped');
});

test('恢复探测失败、无 PID 或系统运行时长不明时保留保护，时钟调整不误清理',()=>{
  const systemUptime=100;
  const record={projectKey:'test',dir:'D:/demo/service',pid:123,startedAt:'2026-10-14T08:30:00.000Z'};
  for(const isProcessAlive of [()=>true,()=>undefined,()=>{throw new Error('EPERM');}]){
    assert.deepEqual(recoverServiceRecords([record],{systemUptime,isProcessAlive}),[record]);
  }
  assert.deepEqual(recoverServiceRecords([record],{systemUptime,isProcessAlive:()=>false}),[]);
  const incomplete=[{...record,pid:null},{...record,pid:-1},{...record,startedAt:null},
    {...record,lastSeenSystemUptime:101}, {...record,lastSeenSystemUptime:-1}];
  assert.deepEqual(recoverServiceRecords(incomplete,{systemUptime,isProcessAlive:()=>true}),incomplete);
  // 上次开机的记录即使碰到本次复用的 PID，也不再阻塞启动。
  assert.deepEqual(recoverServiceRecords([{...record,lastSeenSystemUptime:86400}],{systemUptime,isProcessAlive:()=>true}),[]);
  const oldClock={...record,startedAt:'2000-01-01T00:00:00.000Z'};
  assert.deepEqual(recoverServiceRecords([oldClock],{systemUptime,isProcessAlive:()=>true}),[oldClock]);
});
