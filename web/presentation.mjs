import {t} from './i18n.mjs';
// 仅用于面板显示。日志级别着色不参与后台的健康与就绪判定。
export const MAX_VISIBLE_LINES = 1200;
export const MAX_HIGHLIGHTS = 3000;

export function buildLogView(text, query = '', maxLines = MAX_VISIBLE_LINES, activeIndex = 0) {
  if (!Number.isSafeInteger(maxLines) || maxLines < 1) throw new RangeError(t("日志显示行数必须为正整数"));
  const needle = query.trim();
  if (!text) return {lines: [], total: 0, matched: 0, matches: [], activeIndex: -1, omitted: 0, text: ''};
  const source = text.split('\n');
  if (source.at(-1) === '') source.pop();
  const matches = [], byLine = new Map();
  // 将输入当作字面文本；例如 .*、方括号和 HTML 都不会成为正则或标记。
  const pattern = needle ? new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu') : null;
  if (pattern) for (let i = 0; i < source.length; i++) {
    const hits = [];
    for (const match of source[i].matchAll(pattern)) {
      const hit = {line: i + 1, start: match.index, end: match.index + match[0].length, index: matches.length};
      matches.push(hit);hits.push(hit);
    }
    if (hits.length) byLine.set(i, hits);
  }
  const current = matches.length ? Math.min(Math.max(0, activeIndex), matches.length - 1) : -1;
  // 日志保持连续上下文。命中在较早缓冲中时，显示以它为中心的有限窗口。
  const first = current < 0 ? Math.max(0, source.length - maxLines)
    : Math.max(0, Math.min(source.length - maxLines, matches[current].line - 1 - Math.floor(maxLines / 2)));
  const visibleHits = matches.filter(hit => hit.line > first && hit.line <= first + maxLines);
  const activeVisible = Math.max(0, visibleHits.findIndex(hit => hit.index === current));
  const highlightStart = Math.max(0, Math.min(visibleHits.length - MAX_HIGHLIGHTS, activeVisible - Math.floor(MAX_HIGHLIGHTS / 2)));
  const highlighted = new Set(visibleHits.slice(highlightStart, highlightStart + MAX_HIGHLIGHTS).map(hit => hit.index));
  const offsets=[];let offset=0;for(const value of source){offsets.push(offset);offset+=value.length+1;}
  const lines = source.slice(first, first + maxLines).map((value, i) => ({number: first + i + 1, offset:offsets[first+i], text: value, hits: (byLine.get(first + i) || []).filter(hit => highlighted.has(hit.index)), matched: byLine.has(first + i)}));
  return {
    lines, total: source.length, matched: matches.length, matches, activeIndex: current,
    omitted: Math.max(0, source.length - lines.length), clippedHighlights: Math.max(0, visibleHits.length - MAX_HIGHLIGHTS), text: lines.map(line => line.text).join('\n')
  };
}

export function stepMatch(index, delta, count) {
  if (!count) return -1;
  return ((index + delta) % count + count) % count;
}

export function splitLogLevel(text) {
  const match = /\b(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\b/.exec(text);
  if (!match) return {prefix: '', level: '', message: text};
  return {prefix: text.slice(0, match.index), level: match[0], message: text.slice(match.index + match[0].length)};
}

export function formatUptime(startedAt, now = Date.now()) {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return t("未启动");
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  if (seconds < 60) return t("{0} 秒", seconds);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("{0} 分 {1} 秒", minutes, seconds % 60);
  const hours = Math.floor(minutes / 60);
  return t("{0} 小时 {1} 分", hours, minutes % 60);
}

export function availableActions(service, busy = false) {
  const active = ['starting', 'running', 'stopping'].includes(service.status);
  const orphaned = service.status === 'orphaned';
  return {
    start: !busy && !active && !orphaned,
    stop: !busy && ['starting', 'running'].includes(service.status),
    restart: !busy && !!service.startedAt && !orphaned && service.status !== 'stopping'
  };
}
