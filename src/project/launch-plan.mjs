import path from 'node:path';
import {inspectProject} from './inspect.mjs';
import {resolveJdk as defaultResolveJdk} from './jdk.mjs';
import {exists,walk,readSmall} from './paths.mjs';
import {readManifest} from './jar-manifest.mjs';
import {readPom} from './pom.mjs';
import {fail} from '../core/errors.mjs';
import {validateTool} from '../core/contracts.mjs';
async function checkFresh(artifact,srcNewestMtime) {
  const st=await exists(artifact);if(!st)fail('BUILD_REQUIRED','缺少运行产物，请自行准备构建后重试');
  if(st.isDirectory()){
    const classes=(await walk(artifact)).filter(f=>f.endsWith('.class'));if(!classes.length)fail('BUILD_REQUIRED','缺少已编译 classes');
    // 最旧 class 必须不早于源码，避免局部编译掩盖遗留产物。
    for(const file of classes)if((await exists(file)).mtimeMs+1000<srcNewestMtime)fail('BUILD_REQUIRED','classes 已过期，请自行构建后重试');
  }else if(st.mtimeMs+1000<srcNewestMtime)fail('BUILD_REQUIRED','jar 已过期，请自行构建后重试');
}
export async function prepareLaunch(request,{inspect=inspectProject,resolveJdk=defaultResolveJdk}={}) {
  validateTool('spring_boot_start',request);
  const info=await inspect(request.dir);if(!info.matched)fail('UNSUPPORTED_PROJECT','请选择 Maven Spring Boot 应用模块');
  const {dir,projectKey,artifacts}=info;let mode=request.mode||'auto',mainClass=request.mainClass||null,args=['-Dfile.encoding=UTF-8',...(request.jvmArgs||[])];
  const candidates=artifacts.jarCandidates;
  if(request.jarPath||mode==='jar'||(mode==='auto'&&candidates.length)){
    if(!request.jarPath&&candidates.length>1)fail('AMBIGUOUS_ARTIFACT','存在多个可执行 jar，请明确指定 jarPath');
    const jar=request.jarPath?path.resolve(dir,request.jarPath):candidates[0]?.path;
    if(!jar)fail('BUILD_REQUIRED','缺少可执行 jar');
    await checkFresh(jar,artifacts.srcNewestMtime);const manifest=await readManifest(jar);
    if(!manifest.mainClass)fail('BUILD_REQUIRED','jar 没有 Main-Class');
    for(const dep of manifest.classPath||[]){if(/^[a-z]+:/i.test(dep))fail('BUILD_REQUIRED','薄 jar 依赖必须是本地相对文件');await checkFresh(path.resolve(path.dirname(jar),decodeURIComponent(dep)),0);}
    mode='jar';mainClass=manifest.startClass||manifest.mainClass;args.push('-jar',jar);
  }else{
    mode='classpath';
    if(!mainClass){if(info.mainClasses.length!==1)fail('AMBIGUOUS_MAIN_CLASS','请明确指定 mainClass');mainClass=info.mainClasses[0];}
    let cp=request.classpath?.map(item=>path.resolve(dir,item));
    if(!cp){const saved=(await readSmall(path.join(dir,'target/runtime-classpath.txt'))).trim();cp=[...artifacts.classDirs,...(saved?saved.split(path.delimiter).map(item=>path.resolve(dir,item)):artifacts.dependencyJars)];if(cp.length===artifacts.classDirs.length)fail('BUILD_REQUIRED','缺少运行依赖，请准备 target/lib、target/dependency 或指定完整 classpath');}
    for(const item of cp)await checkFresh(item,item.endsWith('.jar')?0:artifacts.srcNewestMtime);
    const pom=await readPom(dir);
    if(info.reactorRoot!==dir){const root=await readPom(info.reactorRoot);for(const sibling of root.modules){if(sibling===dir)continue;const module=await readPom(sibling);if(pom.dependencies.some(dep=>dep.groupId===module.groupId&&dep.artifactId===module.artifactId)){const siblingInfo=await inspect(sibling);const classes=path.join(sibling,'target/classes');await checkFresh(classes,siblingInfo.artifacts.srcNewestMtime);if(!cp.includes(classes))cp.push(classes);}}}
    if(!(await Promise.all(cp.map(item=>exists(path.join(item,...mainClass.split('.'))+'.class')))).some(Boolean))fail('BUILD_REQUIRED','classpath 中缺少入口类');
    args.push('-cp',cp.join(path.delimiter),mainClass);
  }
  if(request.profile)args.push(`--spring.profiles.active=${request.profile}`);
  const port=request.port??info.port;if(port)args.push(`--server.port=${port}`);
  const jdk=await resolveJdk({jdkHome:request.jdkHome,requiredJavaMajor:info.requiredJavaMajor});
  if(args.join(' ').length>30000)fail('INVALID_ARGUMENT','Windows 启动参数过长，请使用可执行 jar');
  return {projectKey,dir,executable:jdk.executable,args,mode,port,profile:request.profile||null,mainClass,reasons:['仅运行已有产物；没有执行构建']};
}
