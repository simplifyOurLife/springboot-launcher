import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {writeFile, mkdir,utimes,symlink} from 'node:fs/promises';
import {inspectProject} from '../src/project/inspect.mjs';
import {resolveJdk} from '../src/project/jdk.mjs';
import {fixture} from './helpers/project-fixtures.mjs';
import {prepareLaunch} from '../src/project/launch-plan.mjs';
import {normalizeProjectDir} from '../src/project/paths.mjs';
import {discoverProjects} from '../src/project/discover.mjs';
const deps={resolveJdk:async()=>({executable:'C:/JDK 空格/bin/java.exe',major:17})};

for (const kind of ['missing','stale','thin-jar']) test(`${kind} 产物不能隐式构建或启动`,async t=>{
  const f=await fixture(kind); t.after(f.cleanup);
  await assert.rejects(prepareLaunch({dir:f.dir},deps),{code:'BUILD_REQUIRED'});
});
test('新鲜 Boot jar 使用原样参数数组并区分 Spring Profile',async t=>{
  const f=await fixture(); t.after(f.cleanup);
  const p=await prepareLaunch({dir:f.dir,profile:'dev',port:8081},deps);
  assert.equal(p.executable,'C:/JDK 空格/bin/java.exe');
  assert.deepEqual(p.args,['-Dfile.encoding=UTF-8','-jar',f.jarPath,'--spring.profiles.active=dev','--server.port=8081']);
  assert.equal(p.mode,'jar');
});
test('多个可执行 jar 要求显式选择',async t=>{
  const f=await fixture('ambiguous');t.after(f.cleanup);
  await assert.rejects(prepareLaunch({dir:f.dir},deps),{code:'AMBIGUOUS_ARTIFACT'});
  assert.equal((await prepareLaunch({dir:f.dir,jarPath:f.jarPath},deps)).mode,'jar');
});
test('Windows 大小写路径归并为同一项目',async t=>{
  const f=await fixture();t.after(f.cleanup);
  const a=await normalizeProjectDir(f.dir);
  const b=await normalizeProjectDir(process.platform==='win32'?f.dir.toUpperCase():f.dir);
  assert.equal(a.projectKey,b.projectKey);
});
test('未知构建参数、入口覆盖和无效端口被拒绝',async t=>{
  const f=await fixture();t.after(f.cleanup);
  for(const extra of [{build:true},{port:0},{jvmArgs:['-jar']},{jvmArgs:['@args']},{jvmArgs:['-Xbootclasspath:bad']}])
    await assert.rejects(prepareLaunch({dir:f.dir,...extra},deps),{code:'INVALID_ARGUMENT'});
});
test('显式 classpath 保留中文路径，缺少依赖会报错',async t=>{
  const f=await fixture('classes');t.after(f.cleanup);
  const p=await prepareLaunch({dir:f.dir,mode:'classpath',mainClass:'demo.App',classpath:[f.classDir]},deps);
  assert.equal(p.args[2],f.classDir);
  await assert.rejects(prepareLaunch({dir:f.dir,mode:'classpath',classpath:[path.join(f.dir,'missing.jar')]},deps),{code:'BUILD_REQUIRED'});
});
test('受限扫描截断且跳过 target 内部工程',async t=>{
  const f=await fixture();t.after(f.cleanup);
  await mkdir(path.join(f.dir,'target/ignored'),{recursive:true});
  await writeFile(path.join(f.dir,'target/ignored/pom.xml'),'<project/>');
  const found=await discoverProjects(f.root);
  assert.equal(found.projects.length,1);
  assert.equal((await discoverProjects(f.root,{maxDirs:1})).truncated,true);
});
test('本地 parent 属性用于 JDK 要求，多个入口要求显式 mainClass',async t=>{
  const f=await fixture('classes',{pom:'<project><parent><relativePath>../pom.xml</relativePath></parent><artifactId>app</artifactId><properties><java.version>${language.level}</java.version></properties></project>'});t.after(f.cleanup);
  await writeFile(path.join(f.root,'pom.xml'),'<project><properties><language.level>21</language.level></properties></project>');
  await writeFile(path.join(f.dir,'src/main/java/demo/Other.java'),'package demo; @SpringBootApplication public class Other { public static void main(String[] args){} }');
  assert.equal((await inspectProject(f.dir)).requiredJavaMajor,21);
  await assert.rejects(prepareLaunch({dir:f.dir,mode:'classpath',classpath:[f.classDir]},deps),{code:'AMBIGUOUS_MAIN_CLASS'});
});
test('目录联接与真实工程使用同一个标识，扫描不跟随联接',async t=>{
  const f=await fixture();t.after(f.cleanup);const alias=path.join(f.root,'alias');
  await symlink(f.dir,alias,process.platform==='win32'?'junction':'dir');
  assert.equal((await normalizeProjectDir(alias)).projectKey,(await normalizeProjectDir(f.dir)).projectKey);
  assert.equal((await discoverProjects(f.root)).projects.length,1);
});
test('不满足版本要求的 JDK 返回明确错误',async t=>{
  const f=await fixture();t.after(f.cleanup);
  await assert.rejects(resolveJdk({jdkHome:f.jdkHome,requiredJavaMajor:21,probeVersion:async()=> 'openjdk version "17.0.2"'}),{code:'JDK_NOT_FOUND'});
});
test('依赖兄弟模块的过期 classes 被拒绝',async t=>{
  const f=await fixture('classes');t.after(f.cleanup);const sibling=path.join(f.root,'common');
  await mkdir(path.join(sibling,'target/classes'),{recursive:true});
  await mkdir(path.join(sibling,'src/main/java'),{recursive:true});
  await writeFile(path.join(f.root,'pom.xml'),'<project><groupId>demo</groupId><modules><module>中文 工程</module><module>common</module></modules></project>');
  await writeFile(path.join(f.dir,'pom.xml'),'<project><parent><relativePath>../pom.xml</relativePath></parent><artifactId>app</artifactId><dependencies><dependency><groupId>demo</groupId><artifactId>common</artifactId></dependency></dependencies></project>');
  await writeFile(path.join(sibling,'pom.xml'),'<project><parent><relativePath>../pom.xml</relativePath></parent><artifactId>common</artifactId></project>');
  await writeFile(path.join(sibling,'target/classes/Common.class'),'old');
  await writeFile(path.join(sibling,'src/main/java/Common.java'),'new');
  await utimes(path.join(sibling,'src/main/java/Common.java'),new Date(Date.now()+5000),new Date(Date.now()+5000));
  await assert.rejects(prepareLaunch({dir:f.dir,mode:'classpath',classpath:[f.classDir]},deps),{code:'BUILD_REQUIRED'});
});
