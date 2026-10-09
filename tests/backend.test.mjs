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
async function setup(t){const f=await fixture();t.after(f.cleanup);let now=1000;const token=randomBytes(32).toString('hex'),auth=createAuth({token,clock:()=>now}),manager=createServiceManager({logs:createLogStore()});const backend=await startBackend({manager,auth,instanceId:'test-instance'});t.after(backend.close);return {...backend,token,auth,advance:n=>{now+=n;}};}
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
