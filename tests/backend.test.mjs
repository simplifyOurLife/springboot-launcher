import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {createAuth} from '../src/backend/auth.mjs';
import {startBackend} from '../src/backend/server.mjs';
import {fixture} from './helpers/project-fixtures.mjs';
import {createLogStore} from '../src/logs/log-store.mjs';
import {createServiceManager} from '../src/services/manager.mjs';
import {createEventStream} from '../src/backend/events.mjs';
import {EventEmitter} from 'node:events';
import {createWorkspaceStore} from '../src/backend/workspace.mjs';
async function setup(t,options={}){const f=await fixture();t.after(f.cleanup);let now=1000;const token=randomBytes(32).toString('hex'),auth=createAuth({token,clock:()=>now}),manager=createServiceManager({logs:createLogStore()});const backend=await startBackend({manager,auth,instanceId:'test-instance',...options});t.after(backend.close);return {...backend,token,auth,manager,fixture:f,advance:n=>{now+=n;}};}
test('数据接口拒绝未认证、错误 Host 与跨站访问',async t=>{
  const s=await setup(t);
  assert.equal((await fetch(s.origin+'/api/health')).status,401);
  assert.equal((await fetch(s.origin+'/api/health',{headers:{Authorization:'Bearer wrong'}})).status,401);
  const forgedHost=await new Promise((resolve,reject)=>{const request=http.get(s.origin+'/api/health',{headers:{Host:'evil.example',Authorization:`Bearer ${s.token}`}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});
  assert.equal(forgedHost,403);
  assert.equal((await fetch(s.origin+'/api/health',{headers:{Origin:'https://evil.example',Authorization:`Bearer ${s.token}`}})).status,403);
  const health=await fetch(s.origin+'/api/health',{headers:{Authorization:`Bearer ${s.token}`}});assert.equal((await health.json()).data.instanceId,'test-instance');
});
test('单次票据有过期边界，兑换 cookie 并禁止重复使用',async t=>{
  const s=await setup(t),expired=s.auth.issueTicket();s.advance(60000);
  const exchange=ticket=>fetch(s.origin+'/api/session',{method:'POST',headers:{Origin:s.origin,'Content-Type':'application/json'},body:JSON.stringify({ticket})});
  assert.equal((await exchange(expired)).status,401);const ticket=s.auth.issueTicket(),response=await exchange(ticket);assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie');assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Strict'));assert.equal((await exchange(ticket)).status,401);
  const list=await fetch(s.origin+'/api/tools/spring_boot_status',{method:'POST',headers:{Cookie:cookie.split(';')[0],Origin:s.origin},body:'{}'});assert.equal((await list.json()).ok,true);
  s.advance(8*60*60*1000);assert.equal((await fetch(s.origin+'/api/tools/spring_boot_status',{method:'POST',headers:{Cookie:cookie.split(';')[0],Origin:s.origin},body:'{}'})).status,401);
});
test('过大请求体拒绝，未知构建参数不能通过 HTTP 绕过校验',async t=>{
  const s=await setup(t),headers={Authorization:`Bearer ${s.token}`,'Content-Type':'application/json'};
  assert.equal((await fetch(s.origin+'/api/tools/spring_boot_start',{method:'POST',headers,body:'x'.repeat(70000)})).status,413);
  const r=await fetch(s.origin+'/api/tools/spring_boot_start',{method:'POST',headers,body:JSON.stringify({dir:'C:/example',build:true})});assert.equal((await r.json()).error.code,'INVALID_ARGUMENT');
});
test('SSE 返回状态及缺口，连接关闭释放订阅',async t=>{
  const s=await setup(t);const controller=new AbortController();
  const response=await fetch(s.origin+'/api/events',{headers:{Authorization:`Bearer ${s.token}`},signal:controller.signal});assert.equal(response.status,200);
  const reader=response.body.getReader(),chunk=await reader.read();assert.ok(Buffer.from(chunk.value).toString().includes('event: services'));controller.abort();
});

test('SSE 慢消费者超过队列上限即断开且只释放一次',()=>{
  const response=new EventEmitter();response.writableLength=0;response.writeHead=()=>{};response.write=frame=>{response.writableLength+=Buffer.byteLength(frame);return false;};let released=0;response.end=()=>response.emit('close');
  const stream=createEventStream(response,{maxBytes:1024,onClose:()=>released++});assert.equal(stream.send('log',{text:'x'.repeat(700)},1),true);assert.equal(stream.send('log',{text:'x'.repeat(700)},2),false);assert.equal(released,1);assert.equal(stream.send('log',{},3),false);stream.close();assert.equal(released,1);
});

test('面板显示模块作为同源脚本提供，保留内容安全策略', async t => {
  const s = await setup(t);
  const response = await fetch(s.origin + '/presentation.mjs');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/javascript/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await response.text(), /export function buildLogView/);
});

test('目录选择先验证会话、来源和参数，取消不会修改工作区', async t => {
  let opened = 0;
  const s = await setup(t, {pickDirectory: async () => { opened++;return null; }});
  const url = s.origin + '/api/workspace/import';
  assert.equal((await fetch(url, {method: 'POST', body: '{}'})).status, 401);
  const headers = {Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json'};
  assert.equal((await fetch(url, {method: 'POST', headers: {...headers, Origin: 'https://evil.example'}, body: '{}'})).status, 403);
  assert.equal((await fetch(url, {method: 'POST', headers, body: '{"dir":"任意路径"}'})).status, 400);
  assert.equal((await fetch(url, {method: 'POST', headers, body: '{"folderId":"missing"}'})).status, 400);
  assert.equal(opened, 0);
  const result = await (await fetch(url, {method: 'POST', headers, body: '{}'})).json();
  assert.deepEqual(result.data, {cancelled: true});
  assert.equal(opened, 1);
  assert.equal((await (await fetch(s.origin + '/api/workspace', {headers})).json()).data.projects.length, 0);
});

test('导入检查后保存分组，重复导入不重复且不会启动服务', async t => {
  let dir;
  const s = await setup(t, {pickDirectory: async () => dir});dir = s.fixture.dir;
  const headers = {Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json'};
  const post = async (route, body) => (await fetch(s.origin + route, {method: 'POST', headers, body: JSON.stringify(body)})).json();
  const folder = (await post('/api/workspace/command', {type: 'folder.create', name: '业务服务'})).data.folders[0];
  const imported = await post('/api/workspace/import', {folderId: folder.id});
  assert.equal(imported.ok, true);
  assert.equal(imported.data.workspace.projects[0].folderId, folder.id);
  assert.equal(imported.data.projects[0].matched, true);
  assert.equal((await s.manager.list()).length, 0);
  const repeated = await post('/api/workspace/import', {});
  assert.equal(repeated.data.workspace.projects.length, 1);
  assert.equal(repeated.data.workspace.projects[0].folderId, null);
});

test('选择项目根目录时只导入识别到的 Boot 模块，并拒绝空扫描结果', async t => {
  let found = true;
  const dir = process.cwd(), moduleDir = dir + '/module';
  const s = await setup(t, {
    pickDirectory: async () => dir,
    inspect: async input => ({matched: input === moduleDir, projectKey: 'module', dir: moduleDir}),
    discover: async () => ({projects: found ? [{dir: moduleDir, name: 'module'}] : [], warnings: [], truncated: false})
  });
  const headers = {Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json'};
  const response = await fetch(s.origin + '/api/workspace/import', {method: 'POST', headers, body: '{}'});
  assert.equal((await response.json()).data.projects.length, 1);
  found = false;
  const empty = await fetch(s.origin + '/api/workspace/import', {method: 'POST', headers, body: '{}'});
  assert.equal((await empty.json()).error.code, 'NOT_BOOT_PROJECT');
});

test('同时只允许一个目录选择窗口，取消后释放占用', async t => {
  let release, opened;
  const ready = new Promise(resolve => opened = resolve);
  const s = await setup(t, {pickDirectory: async () => { opened();return new Promise(resolve => release = resolve); }});
  const headers = {Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json'};
  const options = {method: 'POST', headers, body: '{}'};
  const first = fetch(s.origin + '/api/workspace/import', options);await ready;
  const second = await (await fetch(s.origin + '/api/workspace/import', options)).json();
  assert.equal(second.error.code, 'PICKER_BUSY');
  release(null);
  assert.equal((await (await first).json()).data.cancelled, true);
});

test('检查接口为网页和 MCP 返回 Profile 来源与 JDK 候选，不返回配置原文',async t=>{
  const s=await setup(t,{inspect:async()=>({dir:'D:/demo',matched:true,profiles:['local','prod'],activeProfile:'local',profileSource:'application.yml',requiredJavaMajor:17,warnings:[]}),scanJdks:async options=>{
    assert.equal(options.requiredJavaMajor,17);
    return {jdks:[{home:'D:/jdk17',major:17,compatible:true}],recommendedJdkHome:'D:/jdk17',warnings:[]};
  }});
  const response=await fetch(s.origin+'/api/tools/spring_boot_inspect',{method:'POST',headers:{Authorization:`Bearer ${s.token}`,'Content-Type':'application/json'},body:JSON.stringify({dir:s.fixture.dir})});
  const {data}=await response.json();assert.equal(data.activeProfile,'local');assert.equal(data.jdks[0].major,17);assert.equal(data.recommendedJdkHome,'D:/jdk17');
});

test('导入在目录窗口等待和项目扫描期间分别推送进度，不等最终响应才反馈',async t=>{
  let choose,finishInspect,pickerReady,inspectReady;
  const choosing=new Promise(resolve=>pickerReady=resolve),scanning=new Promise(resolve=>inspectReady=resolve);
  const dir=process.cwd(),s=await setup(t,{pickDirectory:async()=>{pickerReady();return new Promise(resolve=>choose=resolve);},inspect:async()=>{inspectReady();await new Promise(resolve=>finishInspect=resolve);return {dir,matched:true,projectKey:'app'};}});
  const headers={Authorization:`Bearer ${s.token}`,'Content-Type':'application/json'},abort=new AbortController();t.after(()=>abort.abort());
  const events=await fetch(s.origin+'/api/events',{headers,signal:abort.signal}),reader=events.body.getReader();
  let text='';const until=async value=>{while(!text.includes(value)){const chunk=await reader.read();assert.equal(chunk.done,false);text+=Buffer.from(chunk.value).toString();}};
  await until('event: workspace');
  const pending=fetch(s.origin+'/api/workspace/import',{method:'POST',headers,body:JSON.stringify({requestId:'import-test'})});
  await choosing;await until('"phase":"selecting"');assert.ok(text.includes('import-test'));
  choose(dir);await scanning;await until('"phase":"scanning"');
  finishInspect();assert.equal((await (await pending).json()).data.projects.length,1);
  await until('"phase":"saving"');abort.abort();
});

test('重新导入根目录清理旧版误识别的基础模块记录，不清理无法读取或根外项目',async t=>{
  const dir=process.cwd(),moduleDir=dir+'/module',commonDir=dir+'/common',unreadable=dir+'/unreadable';
  const workspace=createWorkspaceStore({initialState:{folders:[],projects:[{projectKey:'common',dir:commonDir,name:'common',folderId:null},{projectKey:'unreadable',dir:unreadable,name:'unreadable',folderId:null}]}});
  const s=await setup(t,{workspace,pickDirectory:async()=>dir,discover:async()=>({projects:[{dir:moduleDir}],warnings:[]}),inspect:async input=>{if(input===unreadable)throw Error('不可读');return {matched:input===moduleDir,projectKey:'app',dir:moduleDir};}});
  const response=await fetch(s.origin+'/api/workspace/import',{method:'POST',headers:{Authorization:`Bearer ${s.token}`,'Content-Type':'application/json'},body:'{}'});
  const result=await response.json();assert.equal(result.ok,true);assert.deepEqual(result.data.workspace.projects.map(p=>p.projectKey),['unreadable','app']);
});

test('启动校正旧基础模块记录，保留应用、运行服务和不可读取项目',async t=>{
 const projects=['library','app','active','unreadable'].map(projectKey=>({projectKey,dir:`D:/fixtures/${projectKey}`,name:projectKey,folderId:null}));
 const workspace=createWorkspaceStore({initialState:{folders:[],projects}});
 const backend=await startBackend({workspace,auth:createAuth({token:randomBytes(32).toString('hex')}),instanceId:'reconcile',manager:{list:async()=>[{projectKey:'active',status:'running'}]},inspect:async dir=>{if(dir.endsWith('unreadable'))throw Error('不可读取');return {matched:dir.endsWith('app')};}});
 t.after(backend.close);assert.deepEqual(workspace.snapshot().projects.map(p=>p.projectKey),['app','active','unreadable']);
});
