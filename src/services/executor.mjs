import {spawn as nativeSpawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export function createJavaExecutor({spawn=nativeSpawn,gracePeriodMs=8000}={}) {
  function environment(plan){
    // 只固定本次服务的 Java 环境，不更改机器或后台进程环境。
    const env={...process.env};
    if(plan.jdkHome){const pathKey=Object.keys(env).find(key=>key.toUpperCase()==='PATH')||'PATH';env.JAVA_HOME=plan.jdkHome;env[pathKey]=`${plan.jdkHome}/bin${process.platform==='win32'?';':':'}${env[pathKey]||''}`;}
    return env;
  }
  return {
    spawn(plan){return spawn(plan.executable,plan.args,{cwd:plan.dir,env:environment(plan),shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});},
    spawnBuild(plan){
      const env=environment(plan);
      // Maven 也通过 UTF-8 管道输出；保留使用者明确配置的编码，不改父进程环境。
      if(!/(?:^|\s)-Dfile\.encoding=/.test(env.MAVEN_OPTS||''))env.MAVEN_OPTS=`${env.MAVEN_OPTS||''} -Dfile.encoding=UTF-8`.trim();
      const options={cwd:plan.dir,env,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']};
      if(process.platform!=='win32')return spawn(plan.executable,plan.args,options);
      // 固定脚本通过标准输入读取 JSON，不把项目路径拼入 PowerShell 源码。
      const child=spawn(path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../../scripts/run-maven.ps1',import.meta.url))],options);
      child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({executable:plan.executable,args:plan.args}));return child;
    },
    async stop(child,{tree=false}={}){
      if(process.platform!=='win32')return child.kill();
      if(!child.pid||child.exitCode!==null||child.signalCode!==null)return true;
      // 仅使用仍由当前后台持有的活进程，终止 Maven 的整棵进程树，绝不查询端口或复用历史 PID。
      const killTree=force=>new Promise(resolve=>{
        const killer=spawn(path.join(process.env.SystemRoot||'C:/Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T',...(force?['/F']:[])],{shell:false,windowsHide:true,stdio:'ignore'});
        killer.once('error',()=>resolve(false));killer.once('close',code=>resolve(code===0||child.exitCode!==null||child.signalCode!==null));
      });
      if(tree)return killTree(true);
      // 与 dsh 一致：先请求非强制退出，等待 Spring 停止日志；超时才强制终止。
      // close 发生在管道排空后，不能在发送停止请求时关闭日志。
      let timer,closed=false;
      const onClose=()=>{closed=true;};child.once('close',onClose);
      await killTree(false);
      if(!closed&&child.exitCode===null&&child.signalCode===null){
        await new Promise(resolve=>{
          const done=()=>{clearTimeout(timer);child.off('close',done);resolve();};
          child.once('close',done);timer=setTimeout(done,gracePeriodMs);
        });
      }
      child.off('close',onClose);
      return closed||child.exitCode!==null||child.signalCode!==null||await killTree(true);
    }
  };
}
