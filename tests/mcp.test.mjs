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
import {TOOL_NAMES} from '../src/core/contracts.mjs';
const exec=promisify(execFile);
test('两个真实 MCP 代理共用服务并在一个代理退出后继续工作',async t=>{
  const f=await fixture(),home=path.join(f.root,'MCP 后台');let connection;const clients=[];
  t.after(async()=>{await Promise.allSettled(clients.map(c=>c.close()));if(connection)await createBackendClient(connection).shutdown({stopServices:true});await new Promise(r=>setTimeout(r,150));await f.cleanup();});
  await exec(process.execPath,[fileURLToPath(new URL('./helpers/connect-worker.mjs',import.meta.url)),home]);connection=await ensureBackend({home});
  for(const mode of ['legacy','auto']){
    const client=new Client({name:'mvp-test',version:'1.0.0'},{mode}),transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../bin/springboot-launcher.mjs',import.meta.url)),'mcp'],env:{...process.env,SPRINGBOOT_LAUNCHER_HOME:home},stderr:'pipe'});
    await client.connect(transport);clients.push(client);
  }
  const available=(await clients[0].listTools()).tools;assert.deepEqual(available.map(x=>x.name).sort(),[...TOOL_NAMES].sort());assert.ok(available.find(x=>x.name==='spring_boot_start').inputSchema.properties.healthUrl);
  const started=await clients[0].callTool({name:'spring_boot_start',arguments:{dir:f.dir}});assert.equal(started.structuredContent.ok,true);
  const current=await clients[1].callTool({name:'spring_boot_status',arguments:{dir:f.dir}});assert.equal(current.structuredContent.data.pid,started.structuredContent.data.pid);
  const invalid=await clients[0].callTool({name:'spring_boot_start',arguments:{dir:f.dir,build:true}});assert.equal(invalid.isError,true);
  await clients[0].close();
  const stillRunning=await clients[1].callTool({name:'spring_boot_status',arguments:{dir:f.dir}});assert.ok(['starting','running'].includes(stillRunning.structuredContent.data.status));
  const stop=await clients[1].callTool({name:'spring_boot_stop',arguments:{dir:f.dir}});assert.equal(stop.structuredContent.data.status,'stopped');
});
