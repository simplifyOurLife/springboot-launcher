import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chooseLocale, setLocale, t, translateMessage} from '../web/i18n.mjs';
import {formatUptime} from '../web/presentation.mjs';
import {createWorkspaceStore} from '../src/backend/workspace.mjs';
import {createServiceManager} from '../src/services/manager.mjs';
import {createLogStore} from '../src/logs/log-store.mjs';
import {normalizeProjectDir} from '../src/project/paths.mjs';
import {fixture} from './helpers/project-fixtures.mjs';
import {startBackend} from '../src/backend/server.mjs';
import {createAuth} from '../src/backend/auth.mjs';

test('语言选择遵循手动设置、浏览器首选和英文回退', () => {
  assert.equal(chooseLocale('en', ['zh-CN']), 'en');
  assert.equal(chooseLocale(null, ['zh-TW', 'en']), 'zh-CN');
  assert.equal(chooseLocale('invalid', ['fr-FR']), 'en');
  setLocale('en');
  assert.equal(t('已导入 {0} 个应用模块{1}。', 2, ''), 'Imported 2 application modules.');
  assert.equal(formatUptime('2026-10-10T00:00:00Z', Date.parse('2026-10-10T00:01:01Z')), '1m 1s');
  assert.equal(translateMessage('正在检查应用模块 2 / 3…'), 'Inspecting application module 2 / 3…');
  assert.equal(translateMessage('<b>业务日志保持原文</b>'), '<b>业务日志保持原文</b>');
  setLocale('zh-CN');
  assert.equal(translateMessage('Inspecting application module 2 / 3…'), '正在检查应用模块 2 / 3…');
});

test('单项目移除持久化且可重新导入，不修改工程文件', async context => {
  const f=await fixture();context.after(f.cleanup);
  let saved;
  const store=createWorkspaceStore({persist:async next=>{saved=next;}});
  const id=await normalizeProjectDir(f.dir);
  await store.importProjects([id]);
  await store.command({type:'project.remove',projectKey:id.projectKey});
  assert.equal(saved.projects.length,0);
  assert.match(await readFile(path.join(f.dir,'pom.xml'),'utf8'),/<project>/);
  await store.importProjects([id]);
  assert.equal(store.snapshot().projects.length,1);
});

test('运行中的服务拒绝移除，停止后移除清理运行记录', async context => {
  const f=await fixture();context.after(f.cleanup);
  const id=await normalizeProjectDir(f.dir);
  let child;
  const manager=createServiceManager({logs:createLogStore(),probePort:async()=>false,
    prepareLaunch:async()=>({...id,executable:'模拟 Java，不执行',args:[],mode:'classpath'}),
    executor:{spawn(){child=new EventEmitter();child.pid=123;queueMicrotask(()=>child.emit('spawn'));return child;},stop(){child.emit('close',0);return true;}}
  });
  let removed=false;
  await manager.start({dir:f.dir});
  await assert.rejects(manager.removeProject(f.dir,async()=>{removed=true;}),{code:'SERVICE_RUNNING'});
  assert.equal(removed,false);
  await manager.stop(f.dir);
  await assert.rejects(manager.removeProject(f.dir,async()=>{throw new Error('模拟写盘失败');}),/模拟写盘失败/);
  assert.equal((await manager.list()).length,1);
  await manager.removeProject(f.dir,async()=>{removed=true;});
  assert.equal(removed,true);
  assert.deepEqual(await manager.list(),[]);
});

test('异常遗留记录不能移除', async context => {
  const f=await fixture();context.after(f.cleanup);
  const id=await normalizeProjectDir(f.dir);
  const manager=createServiceManager({logs:createLogStore()});
  await assert.rejects(manager.removeProject(f.dir,async()=>{throw new Error('模拟写盘失败');}),/模拟写盘失败/);
  const orphan=createServiceManager({logs:createLogStore(),initialRecords:[{...id,status:'running',pid:123}]});
  await assert.rejects(orphan.removeProject(f.dir,async()=>assert.fail('不可修改工作区')),{code:'SERVICE_RUNNING'});
  assert.equal((await orphan.list()).length,1);
});

test('HTTP 移除接口鉴权、参数校验和刷新后的列表保持一致', async context => {
  const f=await fixture();context.after(f.cleanup);
  const id=await normalizeProjectDir(f.dir),workspace=createWorkspaceStore();
  await workspace.importProjects([id]);
  const token='a'.repeat(64),manager=createServiceManager({logs:createLogStore()});
  const backend=await startBackend({manager,workspace,auth:createAuth({token}),instanceId:'remove-test',inspect:async()=>({matched:true})});
  context.after(backend.close);
  const post=(body,authorized=true)=>fetch(backend.origin+'/api/workspace/command',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  const command={type:'project.remove',projectKey:id.projectKey};
  assert.equal((await post(command,false)).status,401);
  assert.equal((await (await post({...command,deleteFiles:true})).json()).ok,false);
  const result=await (await post(command)).json();
  assert.equal(result.ok,true);assert.equal(result.data.projects.length,0);
  assert.equal((await (await fetch(backend.origin+'/api/workspace',{headers:{Authorization:`Bearer ${token}`}})).json()).data.projects.length,0);
  assert.match(await readFile(path.join(f.dir,'pom.xml'),'utf8'),/<project>/);
});
