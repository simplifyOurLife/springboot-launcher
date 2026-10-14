import test from 'node:test';
import assert from 'node:assert/strict';
import {startBackend} from '../src/backend/server.mjs';
import {createAuth} from '../src/backend/auth.mjs';
import {createBackendClient} from '../src/runtime/client.mjs';
import {verifyConnection} from '../src/runtime/instance.mjs';

test('停止命令等待后台清理和关闭，避免升级复用旧实例',async context=>{
  const token='c'.repeat(64);let cleaned=false;
  const backend=await startBackend({auth:createAuth({token}),instanceId:'shutdown-update-test',manager:{list:async()=>[],shutdown:async()=>{}},onShutdown:async()=>{await new Promise(resolve=>setTimeout(resolve,250));cleaned=true;}});
  context.after(backend.close);
  const connection={origin:backend.origin,instanceId:'shutdown-update-test',token};
  assert.equal((await createBackendClient(connection).shutdown({})).ok,true);
  assert.equal(cleaned,true);
  assert.equal(await verifyConnection(connection),false);
});
test('版本接口需要认证，安装入口拒绝网页指定路径或命令',async context=>{
  let opened=0,shortcuts=0;
  const token='b'.repeat(64),backend=await startBackend({auth:createAuth({token}),instanceId:'updates-test',manager:{list:async()=>[]},appUpdates:{info:async()=>({version:'0.2.0',managed:false}),check:async()=>({state:'unpublished'}),openInstaller:async()=>{opened++;return {opened:true};},createShortcut:async()=>{shortcuts++;return {created:true};}}});
  context.after(backend.close);
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const post=(route,body)=>fetch(backend.origin+route,{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await fetch(backend.origin+'/api/app/info')).status,401);
  assert.equal((await (await fetch(backend.origin+'/api/app/info',{headers})).json()).data.version,'0.2.0');
  assert.equal((await post('/api/app/check-update',{url:'https://other.example'})).status,400);
  assert.equal((await post('/api/app/open-installer',{path:'other.ps1'})).status,400);assert.equal(opened,0);
  assert.equal((await (await post('/api/app/open-installer',{})).json()).data.opened,true);assert.equal(opened,1);
  assert.equal((await post('/api/app/create-shortcut',{root:'D:/arbitrary'})).status,400);assert.equal(shortcuts,0);
  assert.equal((await (await post('/api/app/create-shortcut',{})).json()).data.created,true);assert.equal(shortcuts,1);
});
