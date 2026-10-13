import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLogView, splitLogLevel, formatUptime, availableActions, stepMatch, MAX_HIGHLIGHTS} from '../web/presentation.mjs';
import {setLocale} from '../web/i18n.mjs';

test('大量短日志只显示末尾有限行，行号与复制内容一致', () => {
  const view = buildLogView(Array.from({length: 5000}, (_, i) => `记录 ${i + 1}`).join('\n') + '\n', '', 1200);
  assert.equal(view.total, 5000);
  assert.equal(view.lines.length, 1200);
  assert.equal(view.lines[0].number, 3801);
  assert.equal(view.lines.at(-1).number, 5000);
  assert.equal(view.omitted, 3800);
  assert.equal(view.text.split('\n').length, 1200);
});

test('检索保留未命中的连续上下文，定位窗口覆盖完整缓冲', () => {
  const view = buildLogView('info first\nWARN 中文\n<b>HTML</b>\nwarn 末行\n', ' wArN ', 3);
  assert.deepEqual(view.lines.map(line => line.text), ['info first', 'WARN 中文', '<b>HTML</b>']);
  assert.equal(view.matched, 2);
  assert.equal(view.omitted, 1);
  const next = buildLogView('info first\nWARN 中文\n<b>HTML</b>\nwarn 末行\n', 'warn', 3, 1);
  assert.deepEqual(next.lines.map(line => line.number), [2, 3, 4]);
  assert.equal(next.lines.at(-1).hits[0].index, 1);
  assert.equal(buildLogView('<script>alert(1)</script>', 'script').text, '<script>alert(1)</script>');
  assert.equal(buildLogView('中文\n', '无匹配').matched, 0);
  assert.equal(buildLogView('中文\n', '无匹配').text, '中文');
  assert.equal(buildLogView('').total, 0);
  assert.throws(() => buildLogView('x', '', 0), RangeError);
});

test('按每处关键词计数并循环前后定位，字面符号和 Unicode 不破坏范围', () => {
  const text = 'WARN warn 中文😀WARN\n[x] .* <b>HTML</b>';
  const view = buildLogView(text, 'warn');
  assert.equal(view.matched, 3);
  assert.deepEqual(view.lines[0].hits.map(hit => text.slice(hit.start, hit.end)), ['WARN', 'warn', 'WARN']);
  assert.equal(stepMatch(0, -1, 3), 2);
  assert.equal(stepMatch(2, 1, 3), 0);
  assert.equal(stepMatch(0, 1, 0), -1);
  assert.equal(buildLogView(text, '[x]').matched, 1);
  assert.equal(buildLogView(text, '.*').matched, 1);
  assert.equal(buildLogView(text, '<b>').lines[1].hits[0].start, 7);
});

test('密集关键词限制高亮节点但仍可定位末尾匹配，不裁掉原文', () => {
  const text = 'x '.repeat(5000);
  const view = buildLogView(text, 'x', 1200, 4999);
  assert.equal(view.matched, 5000);
  assert.equal(view.lines[0].hits.length, MAX_HIGHLIGHTS);
  assert.equal(view.lines[0].hits.at(-1).index, 4999);
  assert.equal(view.clippedHighlights, 2000);
  assert.equal(view.text, text);
});

test('日志级别分段只识别独立级别词，保留所有原始字符', () => {
  for (const text of ['10:23:41.018  INFO 42 --- 服务启动', 'ERROR <b>不执行 HTML</b>', 'INFORMATION 不是级别', '中文日志']) {
    const parts = splitLogLevel(text);
    assert.equal(parts.prefix + parts.level + parts.message, text);
  }
  assert.equal(splitLogLevel('INFORMATION 不是级别').level, '');
  assert.equal(splitLogLevel('  WARN 连接超时').level, 'WARN');
});

test('运行时长明确区分未知时间，分钟与小时不产生负数', () => {
  setLocale('zh-CN');
  const start = '2026-10-10T00:00:00Z', now = Date.parse(start);
  assert.equal(formatUptime(null, now), '未启动');
  assert.equal(formatUptime(start, now + 61000), '1 分 1 秒');
  assert.equal(formatUptime(start, now + 3661000), '1 小时 1 分');
  assert.equal(formatUptime(start, now - 1000), '0 秒');
});

test('遗留记录、停止中和请求处理中禁用不合适的操作', () => {
  const running = {status: 'running', startedAt: '2026-10-10T00:00:00Z'};
  assert.deepEqual(availableActions(running), {start: false, stop: true, restart: true});
  assert.deepEqual(availableActions({...running, status: 'stopping'}), {start: false, stop: false, restart: false});
  assert.deepEqual(availableActions({...running, status: 'orphaned'}), {start: false, stop: false, restart: false});
  assert.deepEqual(availableActions(running, true), {start: false, stop: false, restart: false});
  assert.deepEqual(availableActions({status: 'stopped'}), {start: true, stop: false, restart: false});
});
