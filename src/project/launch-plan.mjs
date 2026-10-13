import path from 'node:path';
import {inspectProject} from './inspect.mjs';
import {resolveJdk as defaultResolveJdk} from './jdk.mjs';
import {exists,walk,readSmall} from './paths.mjs';
import {readManifest} from './jar-manifest.mjs';
import {findJarEntries} from './jar-entries.mjs';
import {reactorDependencies} from './reactor.mjs';
import {buildInstructions} from './build-instructions.mjs';
import {fail} from '../core/errors.mjs';
import {validateTool} from '../core/contracts.mjs';
async function checkFresh(artifact,srcNewestMtime,{classes=false}={}) {
  const st=await exists(artifact);if(!st)fail('BUILD_REQUIRED','缺少运行产物，请自行准备构建后重试');
  if(st.isDirectory()&&classes){
    const files=(await walk(artifact,{depth:32})).filter(f=>f.endsWith('.class'));if(!files.length)fail('BUILD_REQUIRED','缺少已编译 classes');
    for(const file of files)if((await exists(file)).mtimeMs+1000<srcNewestMtime)fail('BUILD_REQUIRED','classes 已过期，请自行构建后重试');
  }else if(!st.isDirectory()&&st.mtimeMs+1000<srcNewestMtime)fail('BUILD_REQUIRED','jar 已过期，请自行构建后重试');
}

async function checkModuleClasses(info){
  const roots=info.artifacts.classDirs;
  if(!roots.length)fail('BUILD_REQUIRED','缺少已编译 classes');
  for(const root of roots)await checkFresh(root,0,{classes:true});
  // IDEA 增量编译不会刷新每个 class；按对应源码校验，避免新改一处就误判所有未改 class 过期。
  const javaRoot=path.join(info.dir,'src/main/java');
  for(const source of (await walk(javaRoot,{depth:32})).filter(file=>file.endsWith('.java'))){
    // 仅含包文档的 package-info.java 可以不生成字节码，不能因此反复要求准备。
    if(path.basename(source)==='package-info.java')continue;
    const relative=path.relative(javaRoot,source).replace(/\.java$/,'.class');
    const compiled=(await Promise.all(roots.map(root=>exists(path.join(root,relative))))).filter(Boolean);
    const stale=compiled.length&&Math.max(...compiled.map(st=>st.mtimeMs))+1000<(await exists(source)).mtimeMs;
    if(!compiled.length||stale){
      // 全文件注释不会生成字节码；保留字符串，避免 URL、注释标记吞掉真实代码。
      // 仅对缺失或过期产物读取源码，常规启动不增加整项目源码读取。
      const code=(await readSmall(source)).replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,match=>match.startsWith('/')?' ':match);
      if(!code.trim())continue;
      if(!compiled.length)fail('BUILD_REQUIRED',`存在尚未编译的 Java 源码：${source}`);
      fail('BUILD_REQUIRED',`classes 已过期：${source}`);
    }
  }
  const resourceRoot=path.join(info.dir,'src/main/resources'),outputs=[...roots,...(info.artifacts.resourceDirs||[])];
  for(const source of await walk(resourceRoot,{depth:32})){
    const relative=path.relative(resourceRoot,source),copied=(await Promise.all(outputs.map(root=>exists(path.join(root,relative))))).filter(Boolean);
    if(!copied.length){if(/^(?:application(?:-[\w.-]+)?\.(?:properties|yml|yaml)|logback(?:-spring)?\.xml)$/.test(path.basename(source)))fail('BUILD_REQUIRED','缺少编译后的运行配置，请先执行资源处理和编译');continue;}
    if(Math.max(...copied.map(st=>st.mtimeMs))+1000<(await exists(source)).mtimeMs)fail('BUILD_REQUIRED','运行资源已过期，请先执行资源处理和编译');
  }
}
async function createLaunch(request,{inspect=inspectProject,resolveJdk=defaultResolveJdk}={}) {
  validateTool('spring_boot_start',request);
  const info=await inspect(request.dir);if(!info.matched)fail('UNSUPPORTED_PROJECT','请选择 Maven Spring Boot 应用模块');
  const {dir,projectKey,artifacts}=info;let mode=request.mode||'auto',mainClass=request.mainClass||null,args=['-Dfile.encoding=UTF-8',...(request.jvmArgs||[])];
  const reasons=['已检查当前运行产物'];
  const candidates=artifacts.jarCandidates;
  // 自动模式只有新鲜 jar 才优先；旧 package 快照不能掩盖 IDEA 已更新的 classes。
  const useAutoJar=mode==='auto'&&candidates.some(jar=>jar.mtime+1000>=artifacts.srcNewestMtime);
  if(request.jarPath||mode==='jar'||useAutoJar){
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
    if(cp?.some(item=>artifacts.classDirs.includes(item)))await checkModuleClasses(info);
    if(!cp){
      await checkModuleClasses(info);
      const saved=(await readSmall(path.join(dir,'target/runtime-classpath.txt'))).trim();
      if(!saved&&!artifacts.dependencyJars.length)fail('BUILD_REQUIRED','缺少运行依赖，请准备 target/lib、target/dependency、target/*/lib 或指定完整 classpath');
      cp=[...artifacts.classDirs,...(artifacts.resourceDirs||[]),...(saved?saved.split(path.delimiter).map(item=>path.resolve(dir,item)):artifacts.dependencyJars)];
    }
    for(const item of cp)await checkFresh(item,0);
    const internal=info.reactorRoot!==dir?await reactorDependencies(dir,info.reactorRoot):[];
    const workspaceClasses=[];
    for(const module of internal){const siblingInfo=await inspect(module.dir);await checkModuleClasses(siblingInfo);workspaceClasses.push(...siblingInfo.artifacts.classDirs,...(siblingInfo.artifacts.resourceDirs||[]));}
    cp=[...new Set([...workspaceClasses,...cp])];
    if(!(await Promise.all(cp.map(item=>exists(path.join(item,...mainClass.split('.'))+'.class')))).some(Boolean))fail('BUILD_REQUIRED','classpath 中缺少入口类');
    // 新工作区 classes 替代内部旧 jar，不删除磁盘文件；否则旧分支已删除的类仍可能被组件扫描发现。
    if(!request.classpath){
      const excluded=cp.filter(file=>file.endsWith('.jar')&&internal.some(module=>module.version&&!module.version.includes('${')&&path.basename(file)===`${module.artifactId}-${module.version}.jar`));
      // 容器 core 未必包含 JSP API，只有确认实际类提供者后才排除独立 API。
      const apiClasses={'servlet-api':'javax/servlet/Servlet.class','jsp-api':'javax/servlet/jsp/JspFactory.class'},provided=new Set(),containerProviders=[];
      const checkedClasses=[...Object.values(apiClasses),'javax/security/auth/message/config/AuthConfigFactory.class'];
      for(const file of cp.filter(file=>/^(?:tomcat-embed-|jetty-|undertow-).*\.jar$/.test(path.basename(file)))){
        try{
          const entries=await findJarEntries(file,checkedClasses);
          for(const entry of entries)provided.add(entry);
          if(entries.length)containerProviders.push(file);
        }catch{reasons.push(`无法确认 ${path.basename(file)} 提供的 API，保留未经确认的独立依赖`);}
      }
      const replaced=cp.filter(file=>{const api=path.basename(file).match(/^(servlet-api|jsp-api)-\d/)?.[1];return api&&provided.has(apiClasses[api]);});
      cp=cp.filter(file=>!excluded.includes(file)&&!replaced.includes(file));
      // 自动扫描按文件名排序会让 Geronimo 等旧 API 抢先定义容器类。
      // classes 保持原有优先级，已确认的容器 API 在其他 jar 前，保留业务依赖文件。
      const preferred=containerProviders.filter(file=>cp.includes(file));
      if(preferred.length){
        cp=[...cp.filter(file=>!file.endsWith('.jar')),...preferred,...cp.filter(file=>file.endsWith('.jar')&&!preferred.includes(file))];
        reasons.push(`优先加载容器 API：${preferred.map(file=>path.basename(file)).join('、')}`);
      }
      if(replaced.length)reasons.push(`容器已提供对应 API，排除重复依赖：${replaced.map(file=>path.basename(file)).join('、')}`);
      if(excluded.length)reasons.push(`已用工作区 classes 替代 ${excluded.length} 个内部 jar，原文件保留`);
      // 用相对路径压缩参数；只有整目录均被保留时才使用 Java 的 jar 通配符，避免重新引入已排除 jar。
      for(const lib of artifacts.dependencyDirs||[]){const jars=artifacts.dependencyJars.filter(file=>path.dirname(file)===lib);if(jars.length&&!jars.some(file=>preferred.includes(file))&&jars.every(file=>cp.includes(file))){cp=cp.filter(file=>!jars.includes(file));cp.push(path.join(lib,'*'));}}
      cp=cp.map(file=>path.relative(dir,file)||'.');
    }
    args.push('-cp',cp.join(path.delimiter),mainClass);
  }
  if(request.profile)args.push(`--spring.profiles.active=${request.profile}`);
  // 未指定端口时交给 Spring 配置优先级处理，不能覆盖 Profile 或环境变量。
  const port=request.port??null;if(port)args.push(`--server.port=${port}`);
  const jdk=await resolveJdk({jdkHome:request.jdkHome,requiredJavaMajor:info.requiredJavaMajor});
  if(args.join(' ').length>30000)fail('INVALID_ARGUMENT','Windows 启动参数过长，请使用可执行 jar');
  return {projectKey,dir,executable:jdk.executable,jdkHome:jdk.home||path.dirname(path.dirname(jdk.executable)),args,mode,port,profile:request.profile||info.activeProfile||null,profileSource:request.profile?'explicit':info.profileSource||null,mainClass,healthUrl:request.healthUrl||null,reasons};
}
export async function prepareLaunch(request,dependencies={}){
  try{return await createLaunch(request,dependencies);}
  catch(error){
    if(error.code==='BUILD_REQUIRED'){
      try{error.details={...error.details,build:await buildInstructions(request.dir,request)};}catch{/* 保留最初的项目诊断，准备指引失败不能掩盖根因。 */}
    }
    throw error;
  }
}
