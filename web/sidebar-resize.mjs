// 调整布局只修改 CSS 变量，不重建服务列表与日志连接。
export function setupSidebarResize() {
  const root = document.documentElement, sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('sidebar-resize');
  const key = 'springboot-launcher.sidebar-width';
  const limits = () => [280, Math.max(280, Math.min(480, innerWidth - 480))];
  let width = 320;
  const apply = value => {
    const [min, max] = limits();
    width = Math.round(Math.max(min, Math.min(max, value)));
    root.style.setProperty('--sidebar-width', `${width}px`);
    handle.setAttribute('aria-valuenow', width);
    handle.setAttribute('aria-valuemin', min);
    handle.setAttribute('aria-valuemax', max);
  };
  const save = () => {try {localStorage.setItem(key, String(width));} catch { /* 存储不可用时仍可调整当前页。 */ }};
  try {const saved = Number(localStorage.getItem(key));if (Number.isFinite(saved) && saved >= 280) width = saved;} catch { /* 使用默认宽度。 */ }
  apply(width);
  let drag = null;
  handle.addEventListener('pointerdown', event => {
    if(event.button !== 0)return;
    event.preventDefault();
    drag = {x:event.clientX,width:sidebar.getBoundingClientRect().width};
    handle.setPointerCapture(event.pointerId);root.dataset.sidebarResizing = 'true';
  });
  handle.addEventListener('pointermove', event => {if(drag)apply(drag.width + event.clientX - drag.x);});
  const finish = event => {
    if(!drag)return;
    drag=null;delete root.dataset.sidebarResizing;save();
    if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('lostpointercapture', finish);
  handle.addEventListener('keydown', event => {
    const [min,max]=limits();
    const next = {ArrowLeft:width-16,ArrowRight:width+16,Home:min,End:max}[event.key];
    if(next===undefined)return;
    event.preventDefault();apply(next);save();
  });
  handle.addEventListener('dblclick', () => {apply(320);save();});
  window.addEventListener('resize', () => apply(width));
}
