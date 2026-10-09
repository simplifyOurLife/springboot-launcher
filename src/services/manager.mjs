import {normalizeProjectDir} from '../project/paths.mjs';
import {prepareLaunch as defaultPrepare} from '../project/launch-plan.mjs';
import {createJavaExecutor} from './executor.mjs';
import {probePort as defaultProbe,checkHealth as defaultHealthCheck} from './health.mjs';
import {fail,failure} from '../core/errors.mjs';
export function createServiceManager({prepareLaunch=defaultPrepare,executor=createJavaExecutor(),logs,probePort=defaultProbe,healthCheck=defaultHealthCheck,healthIntervalMs=1500,persistServices=async()=>{},initialRecords=[],clock=()=>new Date().toISOString(),stopTimeoutMs=10000}={}){
  const records=new Map(),locks=new Map(),listeners=new Set();let shutdown=false,persistence=Promise.resolve();
  const blank=id=>({...id,status:'stopped',pid:null,startedAt:null,mode:null,port:null,readiness:{ready:false,evidence:[],reason:'服务尚未启动'},exitCode:null,logPath:null,error:null});
  const view=r=>structuredClone(r.view);
  const active=r=>!!r?.child&&!r.closed;
  for(const data of initialRecords){if(data?.projectKey&&data?.dir)records.set(data.projectKey,{view:{...blank({projectKey:data.projectKey,dir:data.dir}),...data,status:'orphaned',readiness:{ready:false,evidence:[],reason:'上次后台异常退出，需要人工确认'}},closed:true});}
  function emit(r){
    const snapshot=view(r);for(const listener of listeners)try{listener({type:'status',data:snapshot});}catch{/* 查看者独立。 */}
    const safe=[...records.values()].map(view).filter(v=>['starting','running','stopping','orphaned'].includes(v.status));
    persistence=persistence.then(()=>persistServices(safe)).catch(()=>{r.view.error={code:'PERSISTENCE_FAILED',message:'服务恢复信息写入失败，请保留当前后台'};});
    return persistence;
  }
  async function locked(key,fn){const previous=locks.get(key)||Promise.resolve();const work=previous.catch(()=>{}).then(fn);locks.set(key,work);try{return await work;}finally{if(locks.get(key)===work)locks.delete(key);}}
  async function launch(request,id){
    if(shutdown)fail('BACKEND_UNAVAILABLE','后台正在关闭');
    const old=records.get(id.projectKey);if(old?.view.status==='orphaned')fail('ORPHANED_SERVICE','请先人工确认遗留服务，再遗忘记录');if(active(old))return view(old);
    const plan=await prepareLaunch(request);if(plan.port&&await probePort(plan.port))fail('PORT_IN_USE',`端口 ${plan.port} 已被占用，请更换端口`);
    const r={view:{...blank(id),status:'starting',startedAt:clock(),mode:plan.mode,port:plan.port,readiness:{ready:false,evidence:[],reason:'正在等待进程启动'}},request:{...request,dir:id.dir},closed:false,stopping:false};records.set(id.projectKey,r);
    r.view.logPath=await logs.open(id.projectKey,id.dir);await emit(r);
    // 在任何启动日志之前订阅，确保所有入口看到连续序号。
    r.offLogs=logs.subscribe(id.projectKey,event=>{
      if(!plan.healthUrl&&/Started\s+\S+.*\s(?:in|after)\s+[\d.]+\s+seconds/.test(event.text)&&!r.closed&&!r.view.readiness.ready){r.view.readiness={ready:true,evidence:['spring-started-log'],reason:'Spring Boot 已输出启动完成标志'};emit(r);}
      for(const listener of listeners)try{listener({type:'log',data:event});}catch{/* 单个日志查看者独立。 */}
    });
    logs.appendChunk(id.projectKey,'system',Buffer.from(`\n[启动器] 正在启动服务，模式 ${plan.mode}${plan.port?`，端口 ${plan.port}`:''}\n`));
    try{
      r.child=executor.spawn(plan);r.view.pid=r.child.pid||null;
      r.done=new Promise(resolve=>{r.resolve=resolve;});
      r.child.once('error',()=>{r.spawnError=true;r.view.error={code:'START_FAILED',message:'Java 子进程启动失败，请检查 JDK 与运行配置'};});
      r.child.once('exit',(code,signal)=>{r.exitCode=code;r.signal=signal;});
      r.child.once('close',async(code)=>{
        clearInterval(r.healthTimer);r.closed=true;r.view.exitCode=code??r.exitCode??null;r.view.status=r.stopping?'stopped':r.spawnError||code!==0?'failed':'exited';r.view.readiness={ready:false,evidence:[],reason:'进程已退出'};
        logs.appendChunk(id.projectKey,'system',Buffer.from(`\n[启动器] 服务已退出，退出码 ${r.view.exitCode??'未知'}\n`));await logs.close(id.projectKey);r.offLogs?.();await emit(r);r.resolve();
      });
      for(const source of ['stdout','stderr']){r.child[source]?.on('data',bytes=>logs.appendChunk(id.projectKey,source,bytes));r.child[source]?.once('end',()=>logs.finishStream(id.projectKey,source));}
      r.child.once('spawn',()=>{if(!r.closed){r.view.status='running';if(!r.view.readiness.ready)r.view.readiness.reason='进程运行中，就绪未确认';emit(r);}});
      let checking=false;r.healthTimer=setInterval(async()=>{
        if(checking||r.closed||r.stopping||!plan.healthUrl&&r.view.readiness.ready)return;checking=true;
        try{const readiness=plan.healthUrl?await healthCheck(plan.healthUrl):await probePort(plan.port)?{ready:false,evidence:['tcp'],reason:'端口可连接，应用就绪仍未确认'}:null;
          if(readiness&&!r.closed&&!r.stopping&&JSON.stringify(readiness)!==JSON.stringify(r.view.readiness)){r.view.readiness=readiness;emit(r);}
        }catch{if(!r.closed&&!r.stopping){r.view.readiness={ready:false,evidence:[],reason:'健康检查未确认'};emit(r);}}finally{checking=false;}
      },healthIntervalMs);r.healthTimer.unref();
      await emit(r);return view(r);
    }catch(error){r.closed=true;r.view.status='failed';r.view.error=failure(error).error;await logs.close(id.projectKey);r.offLogs?.();await emit(r);fail('START_FAILED','无法启动 Java 子进程，请检查 JDK 与配置');}
  }
  async function stopRecord(r){
    if(r?.view.status==='orphaned')fail('ORPHANED_SERVICE','无法通过旧 PID 停止遗留服务，请人工处理');
    if(!active(r))return r?view(r):null;
    r.stopping=true;r.view.status='stopping';await emit(r);
    try{if(!r.child.kill())fail('STOP_FAILED','无法终止托管进程，重启已取消');}catch{fail('STOP_FAILED','无法终止托管进程，重启已取消');}
    let timer;const completed=await Promise.race([r.done.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),stopTimeoutMs);})]);clearTimeout(timer);
    if(!completed)fail('STOP_FAILED','等待进程退出超时，重启已取消');return view(r);
  }
  return {
    async start(request){const id=await normalizeProjectDir(request.dir);return locked(id.projectKey,()=>launch(request,id));},
    async status(dir){if(!dir)return [...records.values()].map(view);const id=await normalizeProjectDir(dir);return records.has(id.projectKey)?view(records.get(id.projectKey)):blank(id);},
    async list(){return [...records.values()].map(view);},
    async logs(dir,options={}){const id=await normalizeProjectDir(dir);return logs.snapshot(id.projectKey,options);},
    async stop(dir){const id=await normalizeProjectDir(dir);return locked(id.projectKey,async()=>await stopRecord(records.get(id.projectKey))||blank(id));},
    async restart(dir){const id=await normalizeProjectDir(dir);return locked(id.projectKey,async()=>{const r=records.get(id.projectKey);if(!r?.request)fail('INVALID_ARGUMENT','没有可重启的运行配置');const request=r.request;await stopRecord(r);return launch(request,id);});},
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    async confirmOrphan(dir,{acknowledge}={}){if(acknowledge!==true)fail('INVALID_ARGUMENT','遗忘记录前必须确认已人工处理遗留服务');const id=await normalizeProjectDir(dir);return locked(id.projectKey,async()=>{const r=records.get(id.projectKey);if(r?.view.status!=='orphaned')fail('INVALID_ARGUMENT','该项目没有遗留记录');records.delete(id.projectKey);await emit(r);return blank(id);});},
    async shutdown({stopServices=false}={}){shutdown=true;await Promise.allSettled([...locks.values()]);if([...records.values()].some(active)&&!stopServices){shutdown=false;fail('SERVICE_RUNNING','仍有托管服务，请先停止服务或明确选择停止全部');}try{if(stopServices)for(const r of records.values())if(active(r))await stopRecord(r);await persistence;}catch(error){shutdown=false;throw error;}}
  };
}
