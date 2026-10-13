import path from 'node:path';
import {exists} from './paths.mjs';
import {readPom} from './pom.mjs';
import {reactorDependencies} from './reactor.mjs';
import {resolveJdk} from './jdk.mjs';
import {inspectProject} from './inspect.mjs';

const quote=value=>`'${String(value).replaceAll("'","''")}'`;
// 检查只生成参数；执行由服务生命周期管理器统一托管，避免扫描触发 Maven。
export async function mavenPreparation(dir,{mode='auto',jarPath,jdkHome,mvnOffline=true}={}){
  let root=await readPom(dir);while(root.parent?.modules.length)root=root.parent;
  const internal=await reactorDependencies(dir,root.dir);
  const wrapper=path.join(root.dir,process.platform==='win32'?'mvnw.cmd':'mvnw'),executable=await exists(wrapper)?wrapper:'mvn';
  const args=[...(mvnOffline?['-o']:[]),'-f',path.join(root.dir,'pom.xml')];
  if(root.dir!==dir)args.push('-pl',path.relative(root.dir,dir).replaceAll('\\','/'),'-am');
  args.push('-Dmaven.test.skip=true',mode==='jar'||jarPath?'package':'compile','dependency:copy-dependencies','-DincludeScope=runtime',`-DoutputDirectory=${path.join(dir,'target/lib')}`);
  if(internal.length)args.push(`-DexcludeArtifactIds=${[...new Set(internal.map(item=>item.artifactId))].join(',')}`);
  return {executable,args,dir:root.dir,jdkHome,offline:mvnOffline,reason:root.dir!==dir?'从 reactor 根目录准备当前服务及其声明依赖，避免要求先安装内部模块':'准备 classes 和运行依赖；已有产物不会被 clean 删除'};
}
export async function buildInstructions(dir,request={}){
  const plan=await mavenPreparation(dir,request),java=request.jdkHome?`$env:JAVA_HOME = ${quote(request.jdkHome)}\n$env:Path = "$env:JAVA_HOME\\bin;$env:Path"\n`:'';
  return {shell:'PowerShell',cwd:plan.dir,command:`Set-Location -LiteralPath ${quote(plan.dir)}\n${java}& ${quote(plan.executable)} ${plan.args.map(quote).join(' ')}`,reason:plan.reason};
}
export async function prepareBuild(request,{inspect=inspectProject,resolve=resolveJdk}={}){
  const info=await inspect(request.dir),jdk=await resolve({jdkHome:request.jdkHome,requiredJavaMajor:info.requiredJavaMajor});
  return mavenPreparation(info.dir,{...request,jdkHome:jdk.home||path.dirname(path.dirname(jdk.executable))});
}
