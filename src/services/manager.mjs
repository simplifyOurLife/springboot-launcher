import {normalizeProjectDir} from '../project/paths.mjs';
import {prepareLaunch as defaultPrepare} from '../project/launch-plan.mjs';
import {createJavaExecutor} from './executor.mjs';
import {prepareBuild as defaultPrepareBuild} from '../project/build-instructions.mjs';
import {probePort as defaultProbe,checkHealth as defaultHealthCheck} from './health.mjs';
import {fail,failure,LauncherError} from '../core/errors.mjs';
export function createServiceManager({prepareLaunch=defaultPrepare,prepareBuild=defaultPrepareBuild,executor=createJavaExecutor(),logs,probePort=defaultProbe,healthCheck=defaultHealthCheck,healthIntervalMs=1500,persistServices=async()=>{},initialRecords=[],clock=()=>new Date().toISOString(),stopTimeoutMs=10000}={}){
  const records=new Map(),locks=new Map(),listeners=new Set();let shutdown=false,persistence=Promise.resolve();
  const blank=id=>({...id,status:'stopped',phase:null,pid:null,startedAt:null,mode:null,profile:null,profileSource:null,jdkHome:null,port:null,readiness:{ready:false,evidence:[],reason:'服务尚未启动'},exitCode:null,logPath:null,error:null});
  const view=r=>structuredClone(r.view);
  const active=r=>!!r&&!r.closed;
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
    let plan,buildPlan,buildDiagnostic;
    try{plan=await prepareLaunch(request);}catch(error){
      if(error.code!=='BUILD_REQUIRED'||request.noBuild)throw error;
      buildDiagnostic=error.details;buildPlan=await prepareBuild({...request,dir:id.dir});
    }
    const port=plan?.port??request.port??null;if(port&&await probePort(port))fail('PORT_IN_USE',`端口 ${port} 已被占用，请更换端口`);
    const r={view:{...blank(id),status:'starting',phase:buildPlan?'preparing':'launching',startedAt:clock(),mode:plan?.mode??null,profile:plan?.profile??request.profile??null,profileSource:plan?.profileSource??null,jdkHome:plan?.jdkHome??buildPlan?.jdkHome??null,port,readiness:{ready:false,evidence:[],reason:buildPlan?'正在编译并准备运行依赖':'正在等待进程启动'}},request:{...request,dir:id.dir},closed:false,stopping:false,plan};records.set(id.projectKey,r);
    r.done=new Promise(resolve=>{r.resolve=resolve;});
    r.view.logPath=await logs.open(id.projectKey,id.dir);await emit(r);
    // 在任何启动日志之前订阅，确保所有入口看到连续序号。
    const readinessText={stdout:'',stderr:'',system:''};
    r.offLogs=logs.subscribe(id.projectKey,event=>{
      // ANSI 分段和输出块边界不能截断启动完成标志；各输出流独立保留有限尾部。
      readinessText[event.source]=((readinessText[event.source]||'')+event.text).slice(-4096);
      const profileLine=[...readinessText[event.source].matchAll(/(?:The following(?: \d+)? profiles?(?: is| are)? active:|No active profile set[^\r\n]*default profiles?:)\s*([^\r\n]+)\r?\n/g)].at(-1)?.[1];
      if(profileLine&&r.view.phase==='running'){
        const profile=profileLine.replace(/"/g,'').split(',').map(item=>item.trim()).join(',');
        if(/^[\w.-]+(?:,[\w.-]+)*$/.test(profile)&&profile!==r.view.profile){r.view.profile=profile;r.view.profileSource='runtime-log';emit(r);}
      }
      if(r.view.phase==='running'&&!r.plan?.healthUrl&&/Started\s+\S+.*\s(?:in|after)\s+[\d.]+\s+seconds/.test(readinessText[event.source])&&!r.closed&&!r.stopping&&!r.view.readiness.ready){r.view.readiness={ready:true,evidence:['spring-started-log'],reason:'Spring Boot 已输出启动完成标志'};emit(r);}
      for(const listener of listeners)try{listener({type:'log',data:event});}catch{/* 单个日志查看者独立。 */}
    });
    const system=message=>logs.appendChunk(id.projectKey,'system',Buffer.from(`\n[启动器] ${message}\n`));
    let attemptText='';
    function runChild(command,building){
      attemptText='';
      return new Promise((resolve,reject)=>{
        let spawnError=null;
        const startFailure=()=>new LauncherError(building?'BUILD_FAILED':'START_FAILED',building?'无法启动 Maven 准备进程，请检查 Maven Wrapper、MAVEN_HOME 或 PATH':'无法启动 Java 子进程，请检查 JDK 与运行配置',building?buildDiagnostic:undefined);
        logs.beginProcess?.(id.projectKey);
        try{r.child=building?executor.spawnBuild(command):executor.spawn(command);}catch{reject(startFailure());return;}
        const child=r.child;r.view.pid=child.pid||null;
        child.once('error',()=>{spawnError=startFailure();});
        child.once('close',(code)=>{r.child=null;r.view.pid=null;if(spawnError)reject(spawnError);else resolve(code);});
        for(const source of ['stdout','stderr']){child[source]?.on('data',bytes=>{attemptText=(attemptText+bytes.toString()).slice(-65536);logs.appendChunk(id.projectKey,source,bytes);});child[source]?.once('end',()=>logs.finishStream(id.projectKey,source));}
        child.once('spawn',()=>{if(!r.closed&&!r.stopping){if(!building){r.view.status='running';r.view.phase='running';if(!r.view.readiness.ready)r.view.readiness.reason='进程运行中，就绪未确认';}emit(r);}});
      });
    }
    async function pipeline(){
      let code=null;
      try{
        let prepared=false,repairing=false;
        while(!r.stopping){
        if(buildPlan){
          prepared=true;r.view.status='starting';r.view.phase='preparing';r.view.readiness={ready:false,evidence:[],reason:'正在准备运行依赖'};await emit(r);
          if(r.stopping)return;
          system(`检测到缺少或过期产物，自动准备 Maven 编译及运行依赖（${buildPlan.offline?'离线':'在线'}模式）；${buildPlan.reason}`);
          code=await runChild(buildPlan,true);
          if(r.stopping)return;
          // 只在明确的离线缓存缺失时联网重试一次，编译错误不切换网络或掩盖。
          if(code!==0&&request.mvnOffline===undefined&&buildPlan.offline&&/offline mode|has not been downloaded[^\r\n]*before/i.test(attemptText)){
            system('本地 Maven 缓存不完整，自动切换联网准备并重试一次');
            buildPlan=await prepareBuild({...request,dir:id.dir,mvnOffline:false});
            if(r.stopping)return;
            code=await runChild(buildPlan,true);
            if(r.stopping)return;
          }
          if(code!==0){
            // Maven 可能已产出可运行文件；仍须通过新鲜度检查，不能运行旧代码。
            if(!/COMPILATION ERROR|compilation failure/i.test(attemptText)){
              try{plan=await prepareLaunch({...request,mode:'classpath',jarPath:undefined});system('Maven 未完成，但已找到新鲜的 classes 和运行依赖，降级直接启动');}catch{plan=null;}
            }else plan=null;
            if(!plan)fail('BUILD_FAILED',`Maven 准备失败，退出码 ${code??'未知'}。请查看上方 Maven 日志`,buildDiagnostic);
          }
          system('Maven 准备完成，重新检查运行产物');r.view.phase='launching';r.view.readiness.reason='正在检查编译后的运行产物';await emit(r);
          if(r.stopping)return;
          if(code===0)plan=await prepareLaunch({...request,jdkHome:buildPlan.jdkHome,...(repairing||!request.jarPath&&(!request.mode||request.mode==='auto')?{mode:'classpath',jarPath:undefined}:{})});
          if(r.stopping)return;
          if(plan.port&&await probePort(plan.port))fail('PORT_IN_USE',`端口 ${plan.port} 已被占用，请更换端口`);
          if(r.stopping)return;
          Object.assign(r.view,{mode:plan.mode,profile:plan.profile??null,profileSource:plan.profileSource??null,jdkHome:plan.jdkHome??null,port:plan.port});r.plan=plan;
        }
        if(r.stopping)return;
        system(`正在启动服务，模式 ${plan.mode}${plan.port?`，端口 ${plan.port}`:''}`);
        // Maven 输出不能作为应用就绪证据；进入 Java 阶段时清空检测尾部。
        for(const source of Object.keys(readinessText))readinessText[source]='';
        let checking=false;r.healthTimer=setInterval(async()=>{
          if(checking||r.closed||r.stopping||!plan.healthUrl&&r.view.readiness.ready)return;checking=true;
          try{const readiness=plan.healthUrl?await healthCheck(plan.healthUrl):await probePort(plan.port)?{ready:false,evidence:['tcp'],reason:'端口可连接，应用就绪仍未确认'}:null;
            if(readiness&&!r.closed&&!r.stopping&&JSON.stringify(readiness)!==JSON.stringify(r.view.readiness)){r.view.readiness=readiness;emit(r);}
          }catch{if(!r.closed&&!r.stopping){r.view.readiness={ready:false,evidence:[],reason:'健康检查未确认'};emit(r);}}finally{checking=false;}
        },healthIntervalMs);r.healthTimer.unref();
        code=await runChild(plan,false);
        clearInterval(r.healthTimer);
        // 等待 close 确保 stderr 已收齐；仅首次启动缺类才修复，业务错误不重建。
        if(!r.stopping&&!prepared&&!request.noBuild&&!r.view.readiness.ready&&code!==0&&/NoClassDefFoundError|ClassNotFoundException/.test(attemptText)){
          repairing=true;
          system('检测到启动缺类，自动准备运行依赖后重试一次');
          buildPlan=await prepareBuild({...request,dir:id.dir,mode:'classpath',jarPath:undefined});
          continue;
        }
        break;
        }
      }catch(error){
        if(!r.stopping){r.view.error=failure(error).error;system(`启动失败：${r.view.error.message}`);}
      }finally{
        clearInterval(r.healthTimer);r.closed=true;r.view.exitCode=code;r.view.phase=null;r.view.pid=null;
        r.view.status=r.stopping?'stopped':r.view.error||code!==0?'failed':'exited';r.view.readiness={ready:false,evidence:[],reason:r.stopping?'服务已停止':r.view.error?.message||'进程已退出'};
        system(`服务${r.stopping?'已停止':'已退出'}，退出码 ${code??'未知'}`);
        try{await logs.close(id.projectKey);r.offLogs?.();await emit(r);}finally{r.resolve();}
      }
    }
    // 不在项目锁中等待编译完成，否则停止和重启会被长时间编译阻塞。
    r.operation=pipeline();r.operation.catch(()=>{});await emit(r);return view(r);
  }
  async function stopRecord(r){
    if(r?.view.status==='orphaned')fail('ORPHANED_SERVICE','无法通过旧 PID 停止遗留服务，请人工处理');
    if(!active(r))return r?view(r):null;
    r.stopping=true;r.view.status='stopping';await emit(r);
    try{if(r.child&&!await (executor.stop?executor.stop(r.child,{tree:r.view.phase==='preparing'}):r.child.kill()))fail('STOP_FAILED','无法终止托管进程，重启已取消');}catch{fail('STOP_FAILED','无法终止托管进程，重启已取消');}
    let timer;const completed=await Promise.race([r.done.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),stopTimeoutMs);})]);clearTimeout(timer);
    if(!completed)fail('STOP_FAILED','等待进程退出超时，重启已取消');return view(r);
  }
  return {
    async start(request){const id=await normalizeProjectDir(request.dir);return locked(id.projectKey,()=>launch(request,id));},
    async status(dir){if(!dir)return [...records.values()].map(view);const id=await normalizeProjectDir(dir);return records.has(id.projectKey)?view(records.get(id.projectKey)):blank(id);},
    async list(){return [...records.values()].map(view);},
    async removeProject(dir, removeImport){
      const id=await normalizeProjectDir(dir);
      // 与启停使用同一把项目锁，防止检查后并发启动；先保存工作区，再清理已结束的运行记录。
      return locked(id.projectKey,async()=>{
        const r=records.get(id.projectKey);
        if(active(r)||r?.view.status==='orphaned')fail('SERVICE_RUNNING','请先停止服务或确认遗留进程，再移除项目');
        const workspace=await removeImport();
        records.delete(id.projectKey);
        return workspace;
      });
    },
    async logs(dir,options={}){const id=await normalizeProjectDir(dir);return logs.snapshot(id.projectKey,options);},
    async stop(dir){const id=await normalizeProjectDir(dir);return locked(id.projectKey,async()=>await stopRecord(records.get(id.projectKey))||blank(id));},
    async restart(dir){const id=await normalizeProjectDir(dir);return locked(id.projectKey,async()=>{const r=records.get(id.projectKey);if(!r?.request)fail('INVALID_ARGUMENT','没有可重启的运行配置');const request=r.request;await stopRecord(r);return launch(request,id);});},
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    async confirmOrphan(dir,{acknowledge}={}){if(acknowledge!==true)fail('INVALID_ARGUMENT','遗忘记录前必须确认已人工处理遗留服务');const id=await normalizeProjectDir(dir);return locked(id.projectKey,async()=>{const r=records.get(id.projectKey);if(r?.view.status!=='orphaned')fail('INVALID_ARGUMENT','该项目没有遗留记录');records.delete(id.projectKey);await emit(r);return blank(id);});},
    async shutdown({stopServices=false}={}){shutdown=true;await Promise.allSettled([...locks.values()]);if([...records.values()].some(active)&&!stopServices){shutdown=false;fail('SERVICE_RUNNING','仍有托管服务，请先停止服务或明确选择停止全部');}try{if(stopServices)for(const r of records.values())if(active(r))await stopRecord(r);await persistence;}catch(error){shutdown=false;throw error;}}
  };
}
