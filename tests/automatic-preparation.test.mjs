import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fixture} from './helpers/project-fixtures.mjs';
import {prepareLaunch} from '../src/project/launch-plan.mjs';
import {prepareBuild,mavenPreparation} from '../src/project/build-instructions.mjs';
import {createServiceManager} from '../src/services/manager.mjs';
import {createJavaExecutor} from '../src/services/executor.mjs';
import {createLogStore} from '../src/logs/log-store.mjs';

async function until(fn){const end=Date.now()+5000;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,15));}assert.fail('等待模拟生命周期超时');}
async function setup(t,{delay=100,exitCode=0,afterBuild}={}){
  const f=await fixture('missing');let builds=0,launches=0,stoppedTree=false,buildChild;
  const java=createJavaExecutor(),resolve=async()=>({home:f.jdkHome,executable:process.execPath});
  const executor={...java,
    spawnBuild(plan){
      builds++;
      // 只通过 Node 写合成产物和模拟日志，绝不调用 Maven、javac 或业务代码。
      buildChild=spawn(process.execPath,['-e',`const fs=require('node:fs'),path=require('node:path');console.log('Started FakeCompiler in 1.0 seconds');console.error('\x1b[31m[模拟 Maven] 正在准备依赖');setTimeout(()=>{if(${exitCode}===0){fs.mkdirSync(path.join(process.argv[1],'target/classes/demo'),{recursive:true});fs.mkdirSync(path.join(process.argv[1],'target/lib'),{recursive:true});fs.writeFileSync(path.join(process.argv[1],'target/classes/demo/App.class'),'合成 class');fs.writeFileSync(path.join(process.argv[1],'target/lib/dependency.jar'),'合成依赖');}process.exit(${exitCode});},${delay});`,f.dir],{cwd:plan.dir,windowsHide:true,stdio:['ignore','pipe','pipe']});return buildChild;
    },
    spawn(plan){launches++;return java.spawn({...plan,executable:process.execPath,args:[fileURLToPath(new URL('./helpers/fake-java.mjs',import.meta.url))]});},
    async stop(child,options){stoppedTree=options.tree;return child.kill();}
  };
  const manager=createServiceManager({executor,logs:createLogStore(),probePort:async()=>false,
    prepareBuild:request=>prepareBuild(request,{resolve}),
    prepareLaunch:async request=>{if(builds&&afterBuild)await afterBuild();return prepareLaunch(request,{resolveJdk:resolve});}
  });
  t.after(async()=>{await manager.shutdown({stopServices:true});await f.cleanup();});
  return {f,manager,get builds(){return builds;},get launches(){return launches;},get stoppedTree(){return stoppedTree;},get buildChild(){return buildChild;}};
}

test('普通启动自动准备产物，立即返回准备状态，重复启动只产生一条流水线',async t=>{
  const s=await setup(t,{delay:500});
  const [first,second]=await Promise.all([s.manager.start({dir:s.f.dir,profile:'local'}),s.manager.start({dir:s.f.dir,profile:'local'})]);
  assert.equal(first.status,'starting');assert.equal(first.phase,'preparing');assert.equal(second.pid,first.pid);assert.equal(s.builds,1);assert.equal(s.launches,0);
  await until(async()=> (await s.manager.logs(s.f.dir,{lines:100})).text.includes('[模拟 Maven]'));
  assert.equal((await s.manager.status(s.f.dir)).readiness.ready,false,'编译日志不能误报应用就绪');
  await assert.rejects(s.manager.shutdown(),{code:'SERVICE_RUNNING'});
  await until(async()=> (await s.manager.status(s.f.dir)).status==='running');assert.equal(s.launches,1);
  const logs=await s.manager.logs(s.f.dir,{lines:100});assert.match(logs.text,/自动准备 Maven/);assert.match(logs.text,/Maven 准备完成/);
  await until(async()=> (await s.manager.logs(s.f.dir)).text.includes('模拟标准错误'));
  assert.equal((await s.manager.logs(s.f.dir)).events.find(event=>event.text.includes('模拟标准错误'))?.style,undefined,'Maven 未复位的颜色不能污染 Java 输出');
  assert.equal((await s.manager.status(s.f.dir)).profile,'local');
  await s.manager.stop(s.f.dir);
  await s.manager.start({dir:s.f.dir});assert.equal(s.builds,1,'新鲜产物不应重复构建');assert.equal(s.launches,2);
});

test('Maven 准备失败保留退出码与日志，绝不启动 Java',async t=>{
  const s=await setup(t,{exitCode:7});await s.manager.start({dir:s.f.dir});
  const failed=await until(async()=>{const state=await s.manager.status(s.f.dir);return state.status==='failed'&&state;});
  assert.equal(failed.error.code,'BUILD_FAILED');assert.equal(failed.exitCode,7);assert.equal(s.launches,0);assert.match((await s.manager.logs(s.f.dir)).text,/模拟 Maven/);
});

test('准备期间可停止托管进程树，停止后不会启动 Java',async t=>{
  const s=await setup(t,{delay:30000});await s.manager.start({dir:s.f.dir});
  assert.equal((await s.manager.stop(s.f.dir)).status,'stopped');assert.equal(s.stoppedTree,true);assert.equal(s.launches,0);
});

test('准备完成后的检查间隙收到停止，不得继续启动',async t=>{
  let release,entered=false;const gate=new Promise(resolve=>{release=resolve;});
  const s=await setup(t,{afterBuild:async()=>{entered=true;await gate;}});await s.manager.start({dir:s.f.dir});await until(()=>entered);
  const stopping=s.manager.stop(s.f.dir);await until(async()=> (await s.manager.status(s.f.dir)).status==='stopping');release();
  assert.equal((await stopping).status,'stopped');assert.equal(s.launches,0);
});

test('准备期间重启先停止旧流水线，重新准备后只启动一个 Java',async t=>{
  const s=await setup(t,{delay:500});await s.manager.start({dir:s.f.dir});const old=s.buildChild;
  const restarted=await s.manager.restart(s.f.dir);assert.equal(restarted.phase,'preparing');assert.equal(s.builds,2);assert.notEqual(s.buildChild,old);
  await until(async()=> (await s.manager.status(s.f.dir)).status==='running');assert.equal(s.launches,1);
  await s.manager.stop(s.f.dir);await rm(path.join(s.f.dir,'target/classes/demo/App.class'));
  await s.manager.restart(s.f.dir);assert.equal(s.builds,3,'重启必须重新检查已失效的产物');
});

test('noBuild 明确禁用准备，非法参数不触发 Maven',async t=>{
  const s=await setup(t);await assert.rejects(s.manager.start({dir:s.f.dir,noBuild:true}),{code:'BUILD_REQUIRED'});
  await assert.rejects(s.manager.start({dir:s.f.dir,mvnOffline:'false'}),{code:'INVALID_ARGUMENT'});assert.equal(s.builds,0);
});

test('Maven 计划默认离线，允许显式联网，Wrapper 路径与参数分离',async t=>{
  const f=await fixture('missing');t.after(f.cleanup);
  const wrapper=path.join(f.dir,process.platform==='win32'?'mvnw.cmd':'mvnw');await writeFile(wrapper,'# 不执行的模拟 wrapper');
  const plan=await mavenPreparation(f.dir);assert.equal(plan.executable,wrapper);assert.ok(plan.args.includes('-o'));assert.ok(plan.args.includes('compile'));assert.ok(plan.args.includes('-Dmaven.test.skip=true'));assert.equal(plan.args.includes('clean'),false);
  assert.equal((await mavenPreparation(f.dir,{mvnOffline:false,mode:'jar'})).args.includes('-o'),false);
  assert.ok((await mavenPreparation(f.dir,{mode:'jar'})).args.includes('package'));
  assert.match(await readFile(new URL('../scripts/run-maven.ps1',import.meta.url),'utf8'),/ReadToEnd/);
});

test('Windows 固定 Maven 执行脚本安全传递空格中文参数，停止会清理实际模拟后代进程',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture('missing');t.after(f.cleanup);
  const worker=path.join(f.root,'worker.mjs'),command=path.join(f.root,'模拟 Maven.cmd');
  await writeFile(worker,"import {spawn} from 'node:child_process';const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});console.log(JSON.stringify({pid:process.pid,child:child.pid,args:process.argv.slice(2)}));setInterval(()=>{},1000);");
  await writeFile(command,`@echo off\r\n"${process.execPath}" "${worker}" %*\r\n`);
  const executor=createJavaExecutor(),child=executor.spawnBuild({executable:command,args:['-f',path.join(f.dir,'pom.xml'),'-Ddemo=中文 空格'],dir:f.dir,jdkHome:f.jdkHome});
  let output='';child.stdout.on('data',bytes=>{output+=bytes;});
  const closed=new Promise(resolve=>child.once('close',resolve));let stopped=false;
  t.after(async()=>{if(!stopped){await executor.stop(child,{tree:true});await closed;}});
  await until(()=>output.includes('"child":'));
  const info=JSON.parse(output.trim());assert.deepEqual(info.args,['-f',path.join(f.dir,'pom.xml'),'-Ddemo=中文 空格']);
  assert.equal(await executor.stop(child,{tree:true}),true);await closed;stopped=true;
  for(const pid of [info.pid,info.child])assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
  const invalid=executor.spawnBuild({executable:command,args:['-Ddemo=x&echo injected'],dir:f.dir});let stderr='';invalid.stderr.on('data',bytes=>{stderr+=bytes;});
  assert.equal(await new Promise(resolve=>invalid.once('close',resolve)),1);assert.match(stderr,/CMD 特殊字符/);
});
