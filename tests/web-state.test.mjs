import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewState,reduceEvent} from '../web/state.mjs';
const event=(seq,text)=>({type:'log',data:{projectKey:'demo',seq,text,time:'2026-10-09',source:'stdout'}});

test('日志说明与告警关闭后跨后续输出和重连保持，新检索及新轮次按范围恢复',()=>{
  let s=reduceEvent(createViewState(),{type:'log',data:{...event(1,'日志').data,runStartSeq:1}});
  for(const hint of ['limit','persistence','search'])s=reduceEvent(s,{type:'dismiss-hint',hint});
  s=reduceEvent(s,{type:'snapshot',data:{runStartSeq:1,events:[{...event(2,'新输出').data,runStartSeq:1}],lastSeq:2}});
  assert.deepEqual(s.dismissedHints,['limit','persistence','search']);
  s=reduceEvent(s,{type:'restore-hint',hint:'search'});assert.deepEqual(s.dismissedHints,['limit','persistence']);
  s=reduceEvent(s,{type:'log',data:{...event(3,'新轮次').data,runStartSeq:3}});
  assert.deepEqual(s.dismissedHints,[]);
});

test('日志缺口可手动关闭，本轮后续日志和重连不重复提示，新轮次恢复提示资格',()=>{
  let s=reduceEvent(createViewState(),{type:'log',data:{...event(3,'本轮').data,runStartSeq:1}});
  assert.equal(s.gap,true);
  s=reduceEvent(s,{type:'dismiss-gap'});assert.equal(s.gapDismissed,true);
  s=reduceEvent(s,{type:'snapshot',data:{runStartSeq:1,events:[{...event(4,'继续').data,runStartSeq:1}],lastSeq:4,gap:true}});
  assert.equal(s.gapDismissed,true);assert.equal(s.text,'本轮继续');
  s=reduceEvent(s,{type:'log',data:{...event(7,'新一轮').data,runStartSeq:5}});
  assert.equal(s.gapDismissed,false);assert.equal(s.gap,true);
});
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

test('写盘恢复后实时事件和重连快照清除旧警告',()=>{
  const old={projectKey:'demo',seq:1,text:'old',persistenceError:'写盘失败'};
  const warned=reduceEvent(createViewState(),{type:'log',data:old});
  const recovered=reduceEvent(warned,{type:'log',data:{projectKey:'demo',seq:2,text:'new',persistenceError:null}});assert.equal(recovered.persistenceError,null);
  const replay=reduceEvent(createViewState(),{type:'snapshot',data:{events:[old],lastSeq:1,persistenceError:null}});assert.equal(replay.persistenceError,null);
});
