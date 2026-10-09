import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fixture} from './helpers/project-fixtures.mjs';
import {createLogStore} from '../src/logs/log-store.mjs';
test('stdout 与 stderr 分别增量解码中文且清理 ANSI',async t=>{
  const f=await fixture();t.after(f.cleanup);const s=createLogStore();await s.open('key',f.dir);
  const b=Buffer.from('中文');s.appendChunk('key','stdout',b.subarray(0,2));s.appendChunk('key','stderr',Buffer.from('错误'));s.appendChunk('key','stdout',b.subarray(2));s.appendChunk('key','stdout',Buffer.from('\x1b[31m红色\x1b[0m'));
  assert.equal(s.snapshot('key').text,'错误中文红色');await s.close('key');
  assert.equal(await readFile(path.join(f.dir,'logs/springboot-launcher.log'),'utf8'),'错误中文红色');
});
test('内存与磁盘均有上限，旧序号明确返回缺口',async t=>{
  const f=await fixture();t.after(f.cleanup);const s=createLogStore({maxBytes:90,fileBytes:90,fileCount:4});await s.open('key',f.dir);
  for(let i=0;i<15;i++){s.appendChunk('key','stdout',Buffer.from('中文'.repeat(10)+'\n'));await s.flush('key');}
  const snap=s.snapshot('key',{after:1,maxBytes:30});assert.ok(Buffer.byteLength(snap.text)<=30);assert.equal(snap.gap,true);assert.ok(!snap.text.includes('\ufffd'));
  await s.close('key');const names=await readdir(path.join(f.dir,'logs'));assert.equal(names.length,4);
  for(const name of names)assert.ok(Buffer.byteLength(await readFile(path.join(f.dir,'logs',name)))<=90);
});
test('磁盘失败保留内存事件且订阅可释放',async t=>{
  const f=await fixture();t.after(f.cleanup);const s=createLogStore({fs:{mkdir:async()=>{throw new Error('disk');}}});await s.open('key',f.dir);
  const seen=[];const off=s.subscribe('key',e=>seen.push(e));s.appendChunk('key','stdout',Buffer.from('仍可查看'));
  assert.equal(s.snapshot('key').text,'仍可查看');assert.ok(s.snapshot('key').persistenceError);assert.equal(seen.length,1);off();s.appendChunk('key','stderr',Buffer.from('尾部'));assert.equal(seen.length,1);await s.close('key');
});
