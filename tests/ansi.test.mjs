import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnsiDecoder} from '../src/logs/ansi.mjs';
import {createLogStore} from '../src/logs/log-store.mjs';
import {createViewState,reduceEvent} from '../web/state.mjs';
import {createAuth} from '../src/backend/auth.mjs';
import {fixture} from './helpers/project-fixtures.mjs';

test('SGR 跨块保存颜色，支持标准、256 色、RGB 与重置',()=>{
  const d=createAnsiDecoder();assert.deepEqual(d.write('\x1b[3'),[]);
  assert.deepEqual(d.write('2m绿'),[{text:'绿',style:{fg:'#98c379'}}]);
  assert.deepEqual(d.write('\x1b[1;38;5;208m橙\x1b[22;38;2;160;190;255m蓝\x1b[0m原文'),[
    {text:'橙',style:{fg:'#ff8700',bold:true}}, {text:'蓝',style:{fg:'#a0beff'}},{text:'原文'}
  ]);
});
test('控制序列与 OSC 链接不执行，超长和不完整序列有界',()=>{
  const d=createAnsiDecoder();
  assert.deepEqual(d.write('\x1b]8;;https://example.invalid'),[]);
  assert.deepEqual(d.write('\x07<b>文本</b>\x1b]8;;\x1b\\\x1b[2J尾部'),[{text:'<b>文本</b>'},{text:'尾部'}]);
  d.write('\x1b['+'1;'.repeat(2000));assert.deepEqual(d.write('m正常'),[{text:'正常'}]);
});
test('输出流颜色相互隔离，重启重置，快照容量包含样式元数据',async t=>{
  const f=await fixture();t.after(f.cleanup);const store=createLogStore();await store.open('key',f.dir);
  store.appendChunk('key','stdout',Buffer.from('\x1b[31m红'));
  store.appendChunk('key','stderr',Buffer.from('无色'));
  store.appendChunk('key','stdout',Buffer.from('仍红\x1b[0m正常'));
  const snap=store.snapshot('key');assert.equal(snap.text,'红无色仍红正常');
  assert.equal(snap.events[0].style.fg,'#e06c75');assert.equal(snap.events[1].style,undefined);assert.equal(snap.events[2].style.fg,'#e06c75');
  for(const cap of [350,500,1000])assert.ok(Buffer.byteLength(JSON.stringify(store.snapshot('key',{maxBytes:cap})))<=cap);
  await store.close('key');await store.open('key',f.dir);store.appendChunk('key','stdout',Buffer.from('重启'));
  assert.equal(store.snapshot('key').events.at(-1).style,undefined);await store.close('key');
});
test('样式范围随 UTF8 缓冲裁剪，暂停显示时固定颜色，恢复更新',()=>{
  let state=createViewState({maxBytes:12});
  const log=(seq,text,style)=>state=reduceEvent(state,{type:'log',data:{seq,text,style}});
  log(1,'中文',{fg:'#98c379'});state=reduceEvent(state,{type:'pause'});
  log(2,'1234567890',{fg:'#e06c75'});assert.equal(state.text,'1234567890');assert.equal(state.displayText,'中文');
  assert.deepEqual(state.displayRanges,[{start:0,end:2,style:{fg:'#98c379'}}]);
  state=reduceEvent(state,{type:'resume'});assert.deepEqual(state.displayRanges,[{start:0,end:10,style:{fg:'#e06c75'}}]);
});
test('两个本机后台的 Cookie 共存，不互相覆盖或授权',()=>{
  const a=createAuth({token:'a'}),b=createAuth({token:'b'});
  assert.notEqual(a.cookieName,b.cookieName);
  const sa=a.exchangeTicket(a.issueTicket()),sb=b.exchangeTicket(b.issueTicket());
  const req={headers:{cookie:`${a.cookieName}=${sa}; ${b.cookieName}=${sb}`}};
  assert.equal(a.authenticate(req),'session');assert.equal(b.authenticate(req),'session');
  assert.equal(a.authenticate({headers:{cookie:`${b.cookieName}=${sb}`}}),null);
  a.invalidate();assert.equal(a.authenticate(req),null);assert.equal(b.authenticate(req),'session');
});
