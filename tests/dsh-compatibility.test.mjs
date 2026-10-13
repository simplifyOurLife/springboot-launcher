import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile,utimes,rm} from 'node:fs/promises';
import {fixture,zip} from './helpers/project-fixtures.mjs';
import {prepareLaunch} from '../src/project/launch-plan.mjs';
import {inspectProject} from '../src/project/inspect.mjs';
import {discoverProjects} from '../src/project/discover.mjs';
import {buildInstructions} from '../src/project/build-instructions.mjs';
import {reactorDependencies} from '../src/project/reactor.mjs';
import {readPom} from '../src/project/pom.mjs';
import {createJavaExecutor} from '../src/services/executor.mjs';
const deps={resolveJdk:async()=>({executable:'C:/JDK/bin/java.exe',home:'C:/JDK',major:17})};
async function put(file,text){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,text);}

test('薄 jar manifest 中的 config 目录不要求包含 class',async t=>{
  const f=await fixture('classes');t.after(f.cleanup);
  await put(path.join(f.dir,'target/config/application.properties'),'spring.profiles.active=local');
  await put(path.join(f.dir,'target/lib/spring.jar'),'合成依赖，不执行');
  await writeFile(f.jarPath,zip({'META-INF/MANIFEST.MF':'Main-Class: demo.App\r\nClass-Path: config/ lib/spring.jar\r\n\r\n'}));
  assert.equal((await prepareLaunch({dir:f.dir},deps)).mode,'jar');
});

test('继承 Boot 的基础模块、注释中的入口示例不能被发现为服务，完整限定注解可以',async t=>{
  const f=await fixture('classes');t.after(f.cleanup);
  await writeFile(path.join(f.dir,'src/main/java/demo/App.java'),'package demo; @org.springframework.boot.autoconfigure.SpringBootApplication public class App { public static void main(String[] args) {} }');
  const library=path.join(f.root,'common');await put(path.join(library,'pom.xml'),'<project><artifactId>common</artifactId><dependencies><dependency><artifactId>spring-boot-starter</artifactId></dependency></dependencies></project>');
  await put(path.join(library,'src/main/java/Common.java'),'/* @SpringBootApplication public class Fake { public static void main(String[] args){} } */ public class Common {}');
  assert.equal((await inspectProject(library)).matched,false);
  const found=await discoverProjects(f.root);assert.deepEqual(found.projects.map(p=>p.dir),[f.dir]);
});

test('增量编译按对应源码判断，未修改的旧 class 不被误判过期',async t=>{
  const f=await fixture('classes');t.after(f.cleanup);
  const source=path.join(f.dir,'src/main/java/demo/Other.java'),compiled=path.join(f.classDir,'demo/Other.class');
  await put(source,'package demo; public class Other {}');await put(compiled,'旧而有效的 class');
  await utimes(source,new Date(Date.now()-60000),new Date(Date.now()-60000));await utimes(compiled,new Date(Date.now()-30000),new Date(Date.now()-30000));
  await put(path.join(f.dir,'target/lib/spring.jar'),'合成依赖');
  assert.equal((await prepareLaunch({dir:f.dir},deps)).mode,'classpath');
  await utimes(source,new Date(Date.now()+5000),new Date(Date.now()+5000));
  await assert.rejects(prepareLaunch({dir:f.dir},deps),{code:'BUILD_REQUIRED'});
});

test('旧 jar 自动退到新鲜 classes，加入 config 和 assembly lib 且压缩长参数',async t=>{
  const f=await fixture();t.after(f.cleanup);await utimes(f.jarPath,new Date(Date.now()-120000),new Date(Date.now()-120000));
  await put(path.join(f.dir,'target/config/application.properties'),'# 资源目录');
  for(let i=0;i<360;i++)await put(path.join(f.dir,`target/assembly/lib/library-${i}-1.jar`),'不执行');
  const plan=await prepareLaunch({dir:f.dir},deps),cp=plan.args[plan.args.indexOf('-cp')+1];
  assert.equal(plan.mode,'classpath');assert.ok(cp.includes(path.join('target','config')));assert.ok(cp.includes(path.join('target','assembly','lib','*')));assert.ok(cp.length<200);
});

test('深包名不会因八层扫描截断而找不到入口',async t=>{
  const f=await fixture('classes');t.after(f.cleanup);
  await rm(path.join(f.dir,'src/main/java/demo'),{recursive:true,force:true});
  const segments=Array.from({length:12},(_,i)=>`level${i}`),packageName=segments.join('.');
  await put(path.join(f.dir,'src/main/java',...segments,'App.java'),`package ${packageName}; @SpringBootApplication public class App { public static void main(String[] args){} }`);
  await put(path.join(f.classDir,...segments,'App.class'),'合成 class');await put(path.join(f.dir,'target/lib/spring.jar'),'合成依赖');
  const plan=await prepareLaunch({dir:f.dir},deps);assert.equal(plan.mainClass,`${packageName}.App`);
});

test('嵌套 reactor 只挂载传递声明依赖，不挂载其他应用或 dependencyManagement',async t=>{
  const f=await fixture('classes');t.after(f.cleanup);
  await writeFile(path.join(f.root,'pom.xml'),'<project><groupId>demo</groupId><version>1</version><packaging>pom</packaging><modules><module>中文 工程</module><module>parent</module><module>unrelated</module></modules><dependencyManagement><dependencies><dependency><groupId>demo</groupId><artifactId>unrelated</artifactId></dependency></dependencies></dependencyManagement></project>');
  await writeFile(path.join(f.dir,'pom.xml'),'<project><parent><relativePath>../pom.xml</relativePath></parent><artifactId>app</artifactId><dependencies><dependency><groupId>demo</groupId><artifactId>common</artifactId></dependency></dependencies></project>');
  const parent=path.join(f.root,'parent');await put(path.join(parent,'pom.xml'),'<project><parent><relativePath>../pom.xml</relativePath></parent><artifactId>parent</artifactId><packaging>pom</packaging><modules><module>common</module><module>util</module></modules></project>');
  const common=path.join(parent,'common'),util=path.join(parent,'util');
  for(const [dir,name,extra] of [[common,'common','<dependencies><dependency><groupId>demo</groupId><artifactId>util</artifactId></dependency></dependencies>'],[util,'util',''],[path.join(f.root,'unrelated'),'unrelated','']]){
    await put(path.join(dir,'pom.xml'),`<project><parent><relativePath>../pom.xml</relativePath></parent><artifactId>${name}</artifactId>${extra}</project>`);
    await put(path.join(dir,'target/classes/Placeholder.class'),'合成 class');
    await put(path.join(dir,'src/main/java/Disabled.java'),'// public class Disabled {}\n/* 已停用的依赖类，不产生字节码。 */');
  }
  await put(path.join(f.dir,'target/lib/common-1.jar'),'不应加载内部旧 jar');await put(path.join(f.dir,'target/lib/spring-1.jar'),'第三方依赖');
  assert.deepEqual((await reactorDependencies(f.dir,f.root)).map(p=>p.artifactId),['common','util']);
  assert.deepEqual((await readPom(f.dir)).dependencies.map(d=>d.artifactId),['common']);
  const plan=await prepareLaunch({dir:f.dir},deps),cp=plan.args[plan.args.indexOf('-cp')+1];
  assert.ok(cp.includes(path.join('parent','common','target','classes')));assert.ok(cp.includes(path.join('parent','util','target','classes')));assert.ok(!cp.includes('unrelated'));assert.ok(!cp.includes('common-1.jar'));assert.ok(!cp.includes(path.join('lib','*')));
  const instruction=await buildInstructions(f.dir);assert.match(instruction.command,/'-pl' '中文 工程' '-am'/);assert.match(instruction.command,/-DexcludeArtifactIds=common,util/);
});

test('只读启动计划返回可审阅的准备命令，自身不执行 Maven',async t=>{
  const f=await fixture('missing');t.after(f.cleanup);
  await assert.rejects(prepareLaunch({dir:f.dir},deps),error=>error.code==='BUILD_REQUIRED'&&error.details.build.command.includes("'compile' 'dependency:copy-dependencies'"));
});

test('只有文档的 package-info 不需要对应 class',async t=>{
  const f=await fixture('classes');t.after(f.cleanup);
  await put(path.join(f.dir,'src/main/java/demo/package-info.java'),'/** 包文档。 */ package demo;');
  await put(path.join(f.dir,'target/lib/spring.jar'),'合成依赖');
  assert.equal((await prepareLaunch({dir:f.dir},deps)).mode,'classpath');
});

test('完全注释或空白的 Java 文件不要求 class，恢复真实源码后仍需编译',async t=>{
  const f=await fixture('classes');t.after(f.cleanup);
  await put(path.join(f.dir,'target/lib/spring.jar'),'合成依赖');
  const source=path.join(f.dir,'src/main/java/demo/Disabled.java');
  await put(source,'// package demo;\n// public class Disabled {}\n/* public class Old {} */\n');
  await put(path.join(f.dir,'src/main/java/demo/Empty.java'),'\ufeff \r\n\t');
  assert.equal((await prepareLaunch({dir:f.dir},deps)).mode,'classpath');
  // 字符串中的注释标记不能吞掉后面的真实类定义。
  await put(source,'package demo; public class Disabled { String url="https://example.com/*"; }');
  await assert.rejects(prepareLaunch({dir:f.dir},deps),{code:'BUILD_REQUIRED'});
  await put(path.join(f.classDir,'demo/Disabled.class'),'合成 class');
  assert.equal((await prepareLaunch({dir:f.dir},deps)).mode,'classpath');
});

test('容器只有 Servlet API 时保留 JSP API，实际提供 JSP 后才排除重复 jar',async t=>{
  const f=await fixture('classes');t.after(f.cleanup);
  const lib=path.join(f.dir,'target/lib');
  await put(path.join(lib,'tomcat-embed-core-8.jar'),zip({'javax/servlet/Servlet.class':'合成类'}));
  await put(path.join(lib,'jsp-api-2.1.jar'),zip({'javax/servlet/jsp/JspFactory.class':'合成类'}));
  await put(path.join(lib,'servlet-api-2.5.jar'),zip({'javax/servlet/Servlet.class':'旧类'}));
  let plan=await prepareLaunch({dir:f.dir},deps),cp=plan.args[plan.args.indexOf('-cp')+1];
  assert.ok(cp.includes('jsp-api-2.1.jar'),'唯一的 JSP API 提供者必须保留');
  assert.ok(!cp.includes('servlet-api-2.5.jar'),'仍应排除被容器替代的旧 Servlet API');
  await put(path.join(lib,'tomcat-embed-jasper-8.jar'),zip({'javax/servlet/jsp/JspFactory.class':'容器提供的合成类'}));
  plan=await prepareLaunch({dir:f.dir},deps);cp=plan.args[plan.args.indexOf('-cp')+1];
  assert.ok(!cp.includes('jsp-api-2.1.jar'),'已确认的容器 JSP API 替代独立 API');
  await writeFile(path.join(lib,'tomcat-embed-jasper-8.jar'),'不可读取的合成 jar');
  plan=await prepareLaunch({dir:f.dir},deps);cp=plan.args[plan.args.indexOf('-cp')+1];
  assert.ok(cp.includes('jsp-api-2.1.jar'),'不能只凭 jar 名称删除唯一提供者');
});

test('容器实际提供的 API 优先于旧 JASPIC，通配符不得破坏优先级',async t=>{
  const f=await fixture('classes');t.after(f.cleanup);
  const lib=path.join(f.dir,'target/lib'),factory='javax/security/auth/message/config/AuthConfigFactory.class';
  await put(path.join(lib,'geronimo-jaspic_1.0_spec-1.0.jar'),zip({[factory]:'缺少默认实现的旧 API'}));
  await put(path.join(lib,'tomcat-embed-core-8.jar'),zip({[factory]:'容器 API','org/apache/catalina/authenticator/jaspic/AuthConfigFactoryImpl.class':'配套实现'}));
  await put(path.join(lib,'jsp-api-2.1.jar'),zip({'javax/servlet/jsp/JspFactory.class':'唯一的 JSP API'}));
  const plan=await prepareLaunch({dir:f.dir},deps),cp=plan.args[plan.args.indexOf('-cp')+1].split(path.delimiter);
  const container=cp.findIndex(file=>file.endsWith('tomcat-embed-core-8.jar'));
  const legacy=cp.findIndex(file=>file.endsWith('geronimo-jaspic_1.0_spec-1.0.jar'));
  assert.ok(container>=0&&legacy>=0&&container<legacy,'容器 API 必须先加载，依赖 jar 原样保留');
  assert.ok(cp.includes(path.join('target','lib','jsp-api-2.1.jar')),'不能误排除唯一 JSP API');
  assert.ok(!cp.includes(path.join('target','lib','*')),'混合容器目录不能退回不保证顺序的通配符');
  assert.ok(cp.indexOf(path.join('target','classes'))<container,'业务 classes 仍位于依赖前面');
});

test('缺失或陈旧的运行配置不能偷偷挂载未过滤源码替代',async t=>{
  const f=await fixture('classes');t.after(f.cleanup);
  await put(path.join(f.dir,'target/lib/spring.jar'),'合成依赖');await put(path.join(f.dir,'src/main/resources/application.yml'),'spring.profiles.active: local');
  await assert.rejects(prepareLaunch({dir:f.dir},deps),error=>error.code==='BUILD_REQUIRED'&&/运行配置/.test(error.message));
  await put(path.join(f.dir,'target/config/application.yml'),'spring.profiles.active: local');
  assert.equal((await prepareLaunch({dir:f.dir},deps)).mode,'classpath');
  await utimes(path.join(f.dir,'src/main/resources/application.yml'),new Date(Date.now()+5000),new Date(Date.now()+5000));
  await assert.rejects(prepareLaunch({dir:f.dir},deps),error=>error.code==='BUILD_REQUIRED'&&/运行资源/.test(error.message));
});

test('选定 JDK 只固定子进程 JAVA_HOME 和 PATH',()=>{
  let captured;const before=process.env.JAVA_HOME;
  createJavaExecutor({spawn:(...args)=>{captured=args;return {};}}).spawn({dir:'D:/demo',executable:'D:/jdk/bin/java.exe',jdkHome:'D:/jdk',args:['-version']});
  assert.equal(captured[2].env.JAVA_HOME,'D:/jdk');assert.equal(captured[2].shell,false);assert.equal(process.env.JAVA_HOME,before);
});
