import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {fixture} from './helpers/project-fixtures.mjs';
import {ensureBackend} from '../src/runtime/instance.mjs';
import {createBackendClient} from '../src/runtime/client.mjs';
const exec=promisify(execFile);
test('八个工具通过真实 MCP 代理调用，并在一个代理退出后继续工作',async t=>{
  const f=await fixture(),home=path.join(f.root,'MCP 后台');let connection;const clients=[];
  t.after(async()=>{await Promise.allSettled(clients.map(c=>c.close()));if(connection)await createBackendClient(connection).shutdown({stopServices:true});await new Promise(r=>setTimeout(r,150));await f.cleanup();});
  await exec(process.execPath,[fileURLToPath(new URL('./helpers/connect-worker.mjs',import.meta.url)),home]);connection=await ensureBackend({home});
  for(const mode of ['legacy','auto']){
    const client=new Client({name:'mvp-test',version:'1.0.0'},{mode}),transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../bin/springboot-launcher.mjs',import.meta.url)),'mcp'],env:{...process.env,SPRINGBOOT_LAUNCHER_HOME:home},stderr:'pipe'});
    await client.connect(transport);clients.push(client);
  }
  const available=(await clients[0].listTools()).tools;
  assert.deepEqual(available.map(x=>x.name).sort(),['spring_boot_discover','spring_boot_inspect','spring_boot_start','spring_boot_status','spring_boot_logs','spring_boot_stop','spring_boot_restart','spring_boot_dashboard'].sort());
  assert.ok(available.find(x=>x.name==='spring_boot_start').inputSchema.properties.healthUrl);
  await t.test('spring_boot_discover 返回指定目录中的可启动项目',async()=>{
    const result=await clients[0].callTool({name:'spring_boot_discover',arguments:{root:f.root,depth:2}});
    assert.equal(result.structuredContent.ok,true);
    assert.deepEqual(result.structuredContent.data.projects.map(project=>project.dir),[f.dir]);
    assert.equal(result.structuredContent.data.truncated,false);
  });
  await t.test('spring_boot_inspect 返回真实工程入口、Java 要求与运行产物',async()=>{
    const result=await clients[0].callTool({name:'spring_boot_inspect',arguments:{dir:f.dir}});
    assert.equal(result.structuredContent.ok,true);
    const info=result.structuredContent.data;
    assert.equal(info.matched,true);assert.equal(info.dir,f.dir);assert.equal(info.requiredJavaMajor,17);
    assert.deepEqual(info.mainClasses,['demo.App']);
    assert.equal(info.artifacts.jarCandidates[0].path,f.jarPath);
    assert.ok(Array.isArray(info.jdks));
  });
  let started;
  await t.test('spring_boot_start 实际启动受控模拟服务并返回 PID',async()=>{
    started=await clients[0].callTool({name:'spring_boot_start',arguments:{dir:f.dir}});
    assert.equal(started.structuredContent.ok,true);
    assert.ok(Number.isInteger(started.structuredContent.data.pid));
  });
  await t.test('spring_boot_status 从另一代理读取同一个运行进程',async()=>{
    const current=await clients[1].callTool({name:'spring_boot_status',arguments:{dir:f.dir}});
    assert.equal(current.structuredContent.ok,true);
    assert.equal(current.structuredContent.data.pid,started.structuredContent.data.pid);
    assert.ok(['starting','running'].includes(current.structuredContent.data.status));
  });
  await t.test('spring_boot_logs 返回模拟进程的中文 stdout 和 stderr',async()=>{
    // 等待真实管道输出进入缓冲，不依赖固定睡眠或日志立即到达。
    const deadline=Date.now()+5000;let result;
    do{
      result=await clients[1].callTool({name:'spring_boot_logs',arguments:{dir:f.dir,lines:100}});
      assert.equal(result.structuredContent.ok,true);
      if(result.structuredContent.data.text.includes('模拟服务 中文日志')&&result.structuredContent.data.text.includes('模拟标准错误'))break;
      await new Promise(resolve=>setTimeout(resolve,25));
    }while(Date.now()<deadline);
    assert.match(result.structuredContent.data.text,/模拟服务 中文日志/);
    assert.match(result.structuredContent.data.text,/模拟标准错误/);
    assert.ok(result.structuredContent.data.events.some(event=>event.source==='stdout'));
    assert.ok(result.structuredContent.data.events.some(event=>event.source==='stderr'));
  });
  await t.test('spring_boot_dashboard 返回可兑换且只能使用一次的本机面板链接',async()=>{
    const result=await clients[0].callTool({name:'spring_boot_dashboard',arguments:{}});
    assert.equal(result.structuredContent.ok,true);
    const url=new URL(result.structuredContent.data.url);
    assert.equal(url.origin,connection.origin);
    const ticket=new URLSearchParams(url.hash.slice(1)).get('ticket');assert.ok(ticket);
    const exchange=()=>fetch(url.origin+'/api/session',{method:'POST',headers:{Origin:url.origin,'Content-Type':'application/json'},body:JSON.stringify({ticket})});
    const response=await exchange();assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly/);
    assert.equal((await exchange()).status,401);
  });
  await t.test('spring_boot_restart 替换旧进程并沿用同一项目配置',async()=>{
    const result=await clients[1].callTool({name:'spring_boot_restart',arguments:{dir:f.dir}});
    assert.equal(result.structuredContent.ok,true);
    assert.equal(result.structuredContent.data.projectKey,started.structuredContent.data.projectKey);
    assert.ok(Number.isInteger(result.structuredContent.data.pid));
    assert.notEqual(result.structuredContent.data.pid,started.structuredContent.data.pid);
    const status=await clients[0].callTool({name:'spring_boot_status',arguments:{dir:f.dir}});
    assert.equal(status.structuredContent.data.pid,result.structuredContent.data.pid);
  });
  const invalid=await clients[0].callTool({name:'spring_boot_start',arguments:{dir:f.dir,build:true}});assert.equal(invalid.isError,true);
  await clients[0].close();
  const stillRunning=await clients[1].callTool({name:'spring_boot_status',arguments:{dir:f.dir}});assert.ok(['starting','running'].includes(stillRunning.structuredContent.data.status));
  await t.test('spring_boot_stop 在另一代理退出后仍能停止服务',async()=>{
    const stop=await clients[1].callTool({name:'spring_boot_stop',arguments:{dir:f.dir}});
    assert.equal(stop.structuredContent.ok,true);
    assert.equal(stop.structuredContent.data.status,'stopped');assert.equal(stop.structuredContent.data.pid,null);
    const status=await clients[1].callTool({name:'spring_boot_status',arguments:{dir:f.dir}});
    assert.equal(status.structuredContent.data.status,'stopped');
  });
});
