import {en} from './messages.mjs';

export function chooseLocale(saved, languages = []) {
  if (saved === 'zh-CN' || saved === 'en') return saved;
  return languages[0]?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}
let saved;
try { saved = globalThis.localStorage?.getItem('springboot-launcher.language'); } catch { /* 禁用存储时仍可切换语言。 */ }
let locale = chooseLocale(saved, globalThis.navigator?.languages || []);
export const getLocale = () => locale;
export function setLocale(value) {
  locale = value === 'zh-CN' ? 'zh-CN' : 'en';
  try { globalThis.localStorage?.setItem('springboot-launcher.language', locale); } catch { /* 当前页继续使用所选语言。 */ }
}
export function t(key, ...values) {
  const template = locale === 'en' ? en[key] ?? key : key;
  return template.replace(/\{(\d+)\}/g, (_, index) => String(values[index] ?? `{${index}}`));
}

// 仅翻译启动器诊断，不接触原始日志、项目名称、目录、配置值或命令。
const patterns = Object.entries(en).filter(([key]) => /\{\d+\}/.test(key)).sort(([a], [b]) => b.replace(/\{\d+\}/g,'').length-a.replace(/\{\d+\}/g,'').length).map(([key, value]) => {
  const compile = template => new RegExp('^' + template.split(/(\{\d+\})/).map(part => /^\{\d+\}$/.test(part) ? '(.*?)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$');
  return {key, value, zh: compile(key), english: compile(value)};
});
export function translateMessage(message = '') {
  if (!message) return '';
  if (Object.hasOwn(en, message)) return t(message);
  const reverse = Object.entries(en).find(([, value]) => value === message);
  if (reverse) return t(reverse[0]);
  for (const item of patterns) {
    const match = item.zh.exec(message) || item.english.exec(message);
    if (match) return t(item.key, ...match.slice(1).map(value => translateMessage(value)));
  }
  return message;
}

export function setupLanguage(onChange) {
  // 只记录初始 HTML 的文案节点；后续动态界面显式使用 t，不观察或重写应用输出。
  const entries = [];
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest('script, style, svg, #language, #logs')) continue;
    const key = node.textContent.trim();
    if (Object.hasOwn(en, key)) entries.push(() => { node.textContent = t(key); });
  }
  for (const node of document.querySelectorAll('[title], [aria-label], [placeholder]')) {
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      const key = node.getAttribute(attr);
      if (Object.hasOwn(en, key)) entries.push(() => node.setAttribute(attr, t(key)));
    }
  }
  const apply = () => {
    document.documentElement.lang = locale;
    for (const update of entries) update();
    document.getElementById('language').value = locale;
  };
  apply();
  document.getElementById('language').addEventListener('change', event => {
    const old = locale;
    const live = ['connection-label','stream-status','notice-text','sidebar-error','folder-error','import-status-text'].map(id => [document.getElementById(id),document.getElementById(id)?.textContent]);
    setLocale(event.target.value);apply();
    for (const [node, text] of live) if(node) node.textContent=translateMessage(text);
    onChange(old);
  });
}
