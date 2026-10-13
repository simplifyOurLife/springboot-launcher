import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {fixture} from './helpers/project-fixtures.mjs';
import {normalizeProjectDir} from '../src/project/paths.mjs';
import {createLogStore} from '../src/logs/log-store.mjs';
import {createJavaExecutor} from '../src/services/executor.mjs';
import {createServiceManager} from '../src/services/manager.mjs';
export async function waitFor(fn,timeout=3000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,20));}throw new Error('等待状态超时');}
async function setup(t,{fast=false,quiet=false,occupied=false,stopTimeoutMs=10000,initialRecords=[]}={}){
  const f=await fixture();let count=0,options,child;
  const executor=createJavaExecutor({spawn:(exe,args,opt)=>{
    const launched=spawn(exe,args,opt);
    // Windows 停止会额外启动 taskkill；只统计模拟服务，不能把辅助进程算作重复启动。
    if(exe===process.execPath){count++;options=opt;child=launched;}
    return launched;
  }});
  const plan=async request=>({...await normalizeProjectDir(request.dir),executable:process.execPath,args:[fileURLToPath(new URL('./helpers/fake-java.mjs',import.meta.url)),...(fast?['exit']:[]),...(quiet?['quiet']:[])],port:8080,mode:'classpath',profile:null});
  const manager=createServiceManager({prepareLaunch:plan,executor,logs:createLogStore(),probePort:async()=>occupied,initialRecords,stopTimeoutMs});
  t.after(async()=>{await manager.shutdown({stopServices:true});await f.cleanup();});
  return {f,manager,executor,get count(){return count;},get options(){return options;},get child(){return child;}};
}
test('并发启动只产生一个托管进程，重启等待停止且保存日志',async t=>{
  const s=await setup(t);const both=await Promise.all([s.manager.start({dir:s.f.dir}),s.manager.start({dir:s.f.dir})]);assert.equal(s.count,1);assert.equal(both[0].pid,both[1].pid);assert.equal(s.options.shell,false);assert.equal(s.options.windowsHide,true);
  await waitFor(async()=> (await s.manager.logs(s.f.dir,{})).text.includes('模拟标准错误'));
  await assert.rejects(s.manager.shutdown({stopServices:false}),{code:'SERVICE_RUNNING'});
  const restarted=await s.manager.restart(s.f.dir);assert.equal(s.count,2);assert.notEqual(restarted.pid,both[0].pid);
  assert.equal((await s.manager.stop(s.f.dir)).status,'stopped');
});

test('彩色启动标志跨事件仍能确认就绪，Profile 随运行配置返回',async t=>{
  const f=await fixture(),manager=createServiceManager({logs:createLogStore(),prepareLaunch:async request=>({...await normalizeProjectDir(request.dir),executable:process.execPath,args:['-e',"console.log('The following 2 profiles are active: \\\"prod\\\", \\\"metrics\\\"');console.log('\\x1b[32mStarted\\x1b[0m Demo in 1.2 seconds');setInterval(()=>{},1000)"],profile:request.profile,mode:'classpath',port:null})});
  t.after(async()=>{await manager.shutdown({stopServices:true});await f.cleanup();});
  assert.equal((await manager.start({dir:f.dir,profile:'local'})).profile,'local');
  await waitFor(async()=> (await manager.status(f.dir)).readiness.ready);
  assert.equal((await manager.status(f.dir)).profile,'prod,metrics');
  assert.equal((await manager.status(f.dir)).profileSource,'runtime-log');
  assert.equal((await manager.restart(f.dir)).profile,'local');
});
test('进程快速失败保留退出码和尾日志',async t=>{
  const s=await setup(t,{fast:true});await s.manager.start({dir:s.f.dir});
  const end=await waitFor(async()=>{const v=await s.manager.status(s.f.dir);return v.status==='failed'&&v;});assert.equal(end.exitCode,2);assert.ok((await s.manager.logs(s.f.dir,{})).text.includes('模拟标准错误'));
});
test('端口占用不启动也不终止任何进程',async t=>{
  const s=await setup(t,{occupied:true});await assert.rejects(s.manager.start({dir:s.f.dir}),{code:'PORT_IN_USE'});assert.equal(s.count,0);
});
test('异常旧记录必须人工确认，不能使用旧 PID',async t=>{
  const f=await fixture();t.after(f.cleanup);const id=await normalizeProjectDir(f.dir);
  const manager=createServiceManager({initialRecords:[{...id,pid:123,port:8080,status:'running'}],logs:createLogStore(),prepareLaunch:async()=>assert.fail('不应准备启动'),executor:{spawn:()=>assert.fail('不应启动')}});
  await assert.rejects(manager.start({dir:f.dir}),{code:'ORPHANED_SERVICE'});
  await assert.rejects(manager.confirmOrphan(f.dir,{acknowledge:false}),{code:'INVALID_ARGUMENT'});
  assert.equal((await manager.confirmOrphan(f.dir,{acknowledge:true})).status,'stopped');
});
test('停止失败时重启不得产生第二个进程',async t=>{
  const s=await setup(t);await s.manager.start({dir:s.f.dir});const original=s.executor.stop;
  // 在管理器依赖的接口注入失败，兼容 Windows taskkill 和其他平台的 child.kill。
  s.executor.stop=async()=>false;
  try{await assert.rejects(s.manager.restart(s.f.dir),{code:'STOP_FAILED'});assert.equal(s.count,1);}
  finally{s.executor.stop=original;}
});
test('实时查看者能收到首条系统启动日志',async t=>{
  const s=await setup(t),events=[];s.manager.subscribe(e=>{if(e.type==='log')events.push(e.data);});await s.manager.start({dir:s.f.dir});await waitFor(()=>events.length);
  assert.equal(events[0].seq,1);assert.equal(events[0].source,'system');
});
test('运行但无就绪证据时显示未确认，不显示尚未启动',async t=>{
  const s=await setup(t,{quiet:true});await s.manager.start({dir:s.f.dir});const service=await waitFor(async()=>{const v=await s.manager.status(s.f.dir);return v.status==='running'&&v;});
  assert.equal(service.readiness.ready,false);assert.equal(service.readiness.reason,'进程运行中，就绪未确认');
});
