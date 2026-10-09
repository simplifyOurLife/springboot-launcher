import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewState,reduceEvent} from '../web/state.mjs';
const event=(seq,text)=>({type:'log',data:{projectKey:'demo',seq,text,time:'2026-10-09',source:'stdout'}});
test('重连重复事件去重，缺失序号标出日志缺口',()=>{
  let s=createViewState();s=reduceEvent(s,event(1,'第一行\n'));s=reduceEvent(s,event(1,'第一行\n'));assert.equal(s.text,'第一行\n');
  s=reduceEvent(s,event(3,'第三行\n'));assert.equal(s.gap,true);assert.equal(s.receivedSeq,3);
});
test('暂停仍收集事件，继续显示最新有界缓冲',()=>{
  let s=reduceEvent(createViewState(),event(1,'之前'));s=reduceEvent(s,{type:'pause'});s=reduceEvent(s,event(2,'之后'));
  assert.equal(s.displayText,'之前');assert.equal(s.receivedSeq,2);s=reduceEvent(s,{type:'resume'});assert.equal(s.displayText,'之前之后');
});
test('UTF-8 显示缓存有上限且不切坏中文',()=>{
  const s=reduceEvent(createViewState({maxBytes:90}),event(1,'中文'.repeat(100)));assert.ok(Buffer.byteLength(s.text)<=90);assert.ok(!s.text.includes('\ufffd'));assert.equal(s.gap,true);
});
test('快照只追加未见事件，切换项目重置序号',()=>{
  let s=reduceEvent(createViewState(),event(1,'a'));s=reduceEvent(s,{type:'snapshot',data:{events:[event(1,'a').data,event(2,'b').data],lastSeq:2,gap:false}});assert.equal(s.text,'ab');
  s=reduceEvent(s,{type:'project',projectKey:'other'});assert.equal(s.receivedSeq,0);assert.equal(s.text,'');
});
