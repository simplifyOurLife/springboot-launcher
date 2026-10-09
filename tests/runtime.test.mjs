import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fixture} from './helpers/project-fixtures.mjs';
import {ensureBackend} from '../src/runtime/instance.mjs';
const exec=promisify(execFile);
test('两个真实代理共用后台，代理退出后后台仍可查询',async t=>{
  const f=await fixture();const home=path.join(f.root,'后台 空格');let connection;
  t.after(async()=>{if(connection)await fetch(connection.origin+'/api/shutdown',{method:'POST',headers:{Authorization:`Bearer ${connection.token}`},body:JSON.stringify({stopServices:true})});await new Promise(r=>setTimeout(r,200));await f.cleanup();});
  const entry=fileURLToPath(new URL('./helpers/connect-worker.mjs',import.meta.url));
  const results=await Promise.allSettled([exec(process.execPath,[entry,home],{windowsHide:true}),exec(process.execPath,[entry,home],{windowsHide:true})]);
  const problem=results.find(r=>r.status==='rejected');if(problem)throw problem.reason;const [a,b]=results.map(r=>r.value);
  assert.equal(JSON.parse(a.stdout).instanceId,JSON.parse(b.stdout).instanceId);
  assert.equal((await readFile(path.join(home,'spawn-count.txt'),'utf8')).trim(),'spawn');
  connection=await ensureBackend({home});assert.equal((await fetch(connection.origin+'/api/health',{headers:{Authorization:`Bearer ${connection.token}`}})).status,200);
});
test('锁拥有者仍存活时拒绝另建后台',async t=>{
  const f=await fixture();t.after(f.cleanup);const home=path.join(f.root,'busy');await mkdir(home);await writeFile(path.join(home,'.launcher-owned'),'springboot-launcher/v1');
  await writeFile(path.join(home,'backend.lock'),JSON.stringify({ownerPid:process.pid,instanceId:'blocked'}));
  await assert.rejects(ensureBackend({home,timeoutMs:150,spawnBackend:()=>assert.fail('不能产生第二后台')}),{code:'BACKEND_UNAVAILABLE'});
});
