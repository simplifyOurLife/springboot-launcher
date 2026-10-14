import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {fixture} from './helpers/project-fixtures.mjs';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {normalizeProjectDir} from '../src/project/paths.mjs';
import {prepareLaunch} from '../src/project/launch-plan.mjs';
import {createLogStore} from '../src/logs/log-store.mjs';
import {createServiceManager} from '../src/services/manager.mjs';
import {checkHealth} from '../src/services/health.mjs';
import {startBackend} from '../src/backend/server.mjs';
import {createAuth} from '../src/backend/auth.mjs';
import {preparePrivateHome} from '../src/runtime/private-dir.mjs';
import {ensureBackend,atomicState} from '../src/runtime/instance.mjs';
import {runDaemon} from '../src/runtime/daemon.mjs';
import {createBackendClient} from '../src/runtime/client.mjs';
import {createViewState,reduceEvent} from '../web/state.mjs';
const deps={resolveJdk:async()=>({executable:'C:/JDK/bin/java.exe',major:17})};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(fn,timeout=3000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await pause(20);}throw Error('等待状态超时');}

test('未显式覆盖端口时保留 Spring Profile 的配置优先级',async t=>{
  const f=await fixture();t.after(f.cleanup);await mkdir(path.join(f.dir,'src/main/resources'),{recursive:true});await writeFile(path.join(f.dir,'src/main/resources/application-dev.yml'),'server:\n  port: 8087\n');
  const plan=await prepareLaunch({dir:f.dir,profile:'dev'},deps);
  assert.equal(plan.args.some(arg=>arg.startsWith('--server.port=')),false);assert.equal(plan.port,null);
});

test('兄弟模块新 classes 必须优先于依赖目录里的旧 jar',async t=>{
  const f=await fixture('classes');t.after(f.cleanup);const sibling=path.join(f.root,'common'),classes=path.join(sibling,'target/classes'),oldJar=path.join(f.dir,'target/common-1.jar');
  await mkdir(classes,{recursive:true});await writeFile(path.join(f.root,'pom.xml'),'<project><groupId>demo</groupId><modules><module>中文 工程</module><module>common</module></modules></project>');
  await writeFile(path.join(f.dir,'pom.xml'),'<project><parent><relativePath>../pom.xml</relativePath></parent><artifactId>app</artifactId><dependencies><dependency><groupId>demo</groupId><artifactId>common</artifactId></dependency></dependencies></project>');
  await writeFile(path.join(sibling,'pom.xml'),'<project><parent><relativePath>../pom.xml</relativePath></parent><artifactId>common</artifactId></project>');await writeFile(path.join(classes,'Common.class'),'fresh');await writeFile(oldJar,'old');
  const plan=await prepareLaunch({dir:f.dir,mode:'classpath',classpath:[f.classDir,oldJar]},deps),cp=plan.args[plan.args.indexOf('-cp')+1].split(path.delimiter);
  assert.ok(cp.indexOf(classes)<cp.indexOf(oldJar));
});

test('后台正常关闭必须保留未人工确认的遗留服务保护',async t=>{
  const f=await fixture();t.after(f.cleanup);const home=path.join(f.root,'orphan-home'),id=await normalizeProjectDir(f.dir);await preparePrivateHome(home);
  // 自动恢复会清理不存在的 PID；此用例必须用真实存活进程验证跨后台保护，不能使用任意假 PID。
  await atomicState(path.join(home,'services.json'),[{...id,pid:process.pid,status:'running'}]);let instanceId=randomUUID();await atomicState(path.join(home,'backend.lock'),{ownerPid:process.pid,instanceId});
  let backend=await runDaemon({home,instanceId});t.after(()=>backend.close());let connection=JSON.parse(await readFile(path.join(home,'instance.json'),'utf8'));
  assert.equal((await createBackendClient(connection).shutdown()).ok,true);await waitFor(async()=>{try{await readFile(path.join(home,'backend.lock'));return false;}catch(e){return e.code==='ENOENT';}});
  const records=JSON.parse(await readFile(path.join(home,'services.json'),'utf8'));assert.equal(records[0]?.projectKey,id.projectKey);
  instanceId=randomUUID();await atomicState(path.join(home,'backend.lock'),{ownerPid:process.pid,instanceId});backend=await runDaemon({home,instanceId});connection=JSON.parse(await readFile(path.join(home,'instance.json'),'utf8'));
  assert.equal((await createBackendClient(connection).invoke('spring_boot_start',{dir:f.dir})).error.code,'ORPHANED_SERVICE');
  assert.equal(process.kill(process.pid,0),true,'恢复与关闭不得终止遗留进程');
});

test('陈旧锁回收必须等待正在进行的实例交接，不能删除新一代后台',async t=>{
  const f=await fixture();t.after(f.cleanup);const home=path.join(f.root,'guard-home');await preparePrivateHome(home);let spawns=0;
  await atomicState(path.join(home,'backend.lock'),{ownerPid:99999999,instanceId:'stale'});await atomicState(path.join(home,'backend.guard'),{ownerPid:process.pid,id:'test-handoff'});
  const connection={origin:'http://127.0.0.1:12345',instanceId:'new-generation',token:randomBytes(32).toString('hex')};
  const pending=ensureBackend({home,timeoutMs:5000,isProcessAlive:pid=>pid===process.pid,request:async()=>new Response(JSON.stringify({ok:true,data:{instanceId:connection.instanceId}})),spawnBackend:()=>{spawns++;return {pid:process.pid};}});
  await pause(2000);await atomicState(path.join(home,'backend.lock'),{ownerPid:process.pid,instanceId:connection.instanceId});await atomicState(path.join(home,'instance.json'),connection);await rm(path.join(home,'backend.guard'));
  const result=await pending;assert.equal(spawns,0);assert.equal(result.instanceId,connection.instanceId);
});

test('小片段日志、单个大块和快照均有可传输的容量界限',async t=>{
  const f=await fixture();t.after(f.cleanup);const logs=createLogStore({fs:{mkdir:async()=>{throw Error('disk');}}});await logs.open('key',f.dir);const live=[];logs.subscribe('key',e=>live.push(e));
  logs.appendChunk('key','stdout',Buffer.from('中文'.repeat(60000)));assert.ok(live.every(e=>Buffer.byteLength(JSON.stringify(e))<262144));
  for(let i=0;i<5000;i++)logs.appendChunk('key','stdout',Buffer.from('x'));
  const snapshot=logs.snapshot('key',{lines:1000,maxBytes:65536});assert.ok(snapshot.events.length<=2000);assert.ok(Buffer.byteLength(JSON.stringify(snapshot))<=65536);assert.equal(snapshot.gap,true);
  let state=createViewState();for(let seq=1;seq<=5000;seq++)state=reduceEvent(state,{type:'log',data:{projectKey:'key',seq,text:'x'}});assert.ok(state.logs.length<=2000);
});

test('同一个序号内裁剪日志也会明确显示缺口',async t=>{
  const f=await fixture();t.after(f.cleanup);const logs=createLogStore();await logs.open('key',f.dir);logs.appendChunk('key','stdout',Buffer.from('一\n二\n三'));const snapshot=logs.snapshot('key',{lines:1});
  assert.equal(snapshot.gap,true);assert.equal(reduceEvent(createViewState(),{type:'snapshot',data:snapshot}).gap,true);await logs.close('key');
});

test('中途写盘失败主动通知查看者，快照与面板保留警告',async t=>{
  const f=await fixture();t.after(f.cleanup);const logs=createLogStore({fs:{mkdir:async()=>{},stat:async()=>({size:0}),appendFile:async()=>{throw Error('disk full');}}});await logs.open('key',f.dir);const events=[];logs.subscribe('key',e=>events.push(e));logs.appendChunk('key','stdout',Buffer.from('before'));await logs.flush('key');
  assert.ok(events.some(e=>e.persistenceError));const snapshot=logs.snapshot('key');assert.ok(reduceEvent(createViewState(),{type:'snapshot',data:snapshot}).persistenceError);assert.ok(events.reduce((s,data)=>reduceEvent(s,{type:'log',data}),createViewState()).persistenceError);await logs.close('key');
});

async function streamSetup(t,manager){const token=randomBytes(32).toString('hex'),backend=await startBackend({manager,auth:createAuth({token}),instanceId:'regression'});t.after(backend.close);return {...backend,headers:{Authorization:`Bearer ${token}`}};}
async function firstSnapshot(response){const reader=response.body.getReader();let text='';while(!text.includes('event: snapshot')){const chunk=await reader.read();assert.equal(chunk.done,false,'连接不能在快照前关闭');text+=new TextDecoder().decode(chunk.value);}while(!text.slice(text.indexOf('event: snapshot')).includes('\n\n')){const chunk=await reader.read();assert.equal(chunk.done,false);text+=new TextDecoder().decode(chunk.value);}const frame=text.slice(text.indexOf('event: snapshot'));return JSON.parse(frame.split('\n').find(line=>line.startsWith('data: ')).slice(6));}

test('大日志可补取快照，重连使用更新的 Last-Event-ID',async t=>{
  const f=await fixture();t.after(f.cleanup);const logs=createLogStore(),id=await normalizeProjectDir(f.dir);await logs.open(id.projectKey,f.dir);logs.appendChunk(id.projectKey,'stdout',Buffer.from('x'.repeat(300000)));const manager=createServiceManager({logs});const s=await streamSetup(t,manager),controller=new AbortController();t.after(()=>controller.abort());
  let snapshot=await firstSnapshot(await fetch(`${s.origin}/api/events?dir=${encodeURIComponent(f.dir)}&after=0`,{headers:s.headers,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(3000)])}));assert.ok(snapshot.events.length);assert.equal(snapshot.gap,true);controller.abort();
  const next=new AbortController();t.after(()=>next.abort());snapshot=await firstSnapshot(await fetch(`${s.origin}/api/events?dir=${encodeURIComponent(f.dir)}&after=0`,{headers:{...s.headers,'Last-Event-ID':String(snapshot.lastSeq)},signal:next.signal}));assert.equal(snapshot.events.length,0);next.abort();await logs.close(id.projectKey);
});

test('SSE 初始化等待期间断线不会留下迟到订阅',async t=>{
  let release,entered,subscriptions=0;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const s=await streamSetup(t,{status:async()=>{entered();await gate;return {projectKey:'key'};},list:async()=>[],logs:async()=>({events:[]}),subscribe:()=>{subscriptions++;return ()=>subscriptions--;}});
  const controller=new AbortController(),pending=fetch(s.origin+'/api/events?dir=demo',{headers:s.headers,signal:controller.signal}).catch(()=>null);await started;controller.abort();await pending;await pause(30);release();await pause(60);assert.equal(subscriptions,0);
});

test('健康 URL 可以启动且拒绝非本机或带凭据地址',async t=>{
  const f=await fixture();t.after(f.cleanup);const healthUrl='http://127.0.0.1:8087/actuator/health';assert.equal((await prepareLaunch({dir:f.dir,healthUrl},deps)).healthUrl,healthUrl);
  for(const invalid of ['https://example.com/health','http://user:secret@127.0.0.1/health'])await assert.rejects(prepareLaunch({dir:f.dir,healthUrl:invalid},deps),{code:'INVALID_ARGUMENT'});
});

test('健康检查拒绝 DOWN、401、超时，并在读取期间限制响应',async t=>{
  let mode='UP';const server=http.createServer((req,res)=>{if(mode==='401'){res.writeHead(401).end();return;}if(mode==='slow'){setTimeout(()=>res.end('{"status":"UP"}'),200).unref();return;}res.end(JSON.stringify({status:mode}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));const url=`http://127.0.0.1:${server.address().port}/actuator/health`;
  assert.equal((await checkHealth(url)).ready,true);for(const value of ['DOWN','401','slow']){mode=value;assert.equal((await checkHealth(url,{timeoutMs:30})).ready,false);}
  let pulled=0,cancelled=false;const body=new ReadableStream({pull(c){pulled++;c.enqueue(new Uint8Array(8192));if(pulled===80)c.close();},cancel(){cancelled=true;}});
  assert.equal((await checkHealth(url,{request:async()=>new Response(body)})).ready,false);assert.ok(pulled<80);assert.equal(cancelled,true);
});

test('显式健康检查持续更新，DOWN 不会被 Spring 启动日志覆盖',async t=>{
  const f=await fixture();t.after(f.cleanup);let mode='DOWN',calls=0;const logs=createLogStore(),id=await normalizeProjectDir(f.dir);
  const manager=createServiceManager({logs,prepareLaunch:async()=>({...id,mode:'jar',port:null,healthUrl:'http://127.0.0.1:8087/actuator/health'}),healthIntervalMs:15,healthCheck:async()=>{calls++;return {ready:mode==='UP',evidence:mode==='UP'?['actuator']:[],reason:mode};},executor:{spawn(){const child=new EventEmitter();child.pid=123;child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{queueMicrotask(()=>child.emit('close',0));return true;};queueMicrotask(()=>child.emit('spawn'));return child;}}});
  t.after(()=>manager.shutdown({stopServices:true}));await manager.start({dir:f.dir});logs.appendChunk(id.projectKey,'stdout',Buffer.from('Started Demo in 1.2 seconds\n'));await waitFor(()=>calls>0,800);assert.equal((await manager.status(f.dir)).readiness.ready,false);
  mode='UP';await waitFor(async()=>(await manager.status(f.dir)).readiness.ready,800);mode='DOWN';await waitFor(async()=>!(await manager.status(f.dir)).readiness.ready,800);
});
