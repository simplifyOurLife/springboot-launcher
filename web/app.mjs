import {t, translateMessage, setupLanguage} from './i18n.mjs';
import {createViewState, reduceEvent} from './state.mjs';
import {buildLogView, splitLogLevel, formatUptime, availableActions, stepMatch} from './presentation.mjs';
import {setupSidebarResize} from './sidebar-resize.mjs';
import {setupSelectFields, refreshSelectFields} from './select-field.mjs';
import {createToast} from './toast.mjs';
import {setupAppUpdates} from './app-updates.mjs';

const $ = id => document.getElementById(id);
const toast=createToast($('notice'),$('notice-text'),$('dismiss-notice'));
const projects = new Map();
const configIds = ['profile', 'port', 'mode', 'jdk', 'jdk-manual', 'jar', 'main-class', 'classpath', 'jvm', 'health-url'];
const statusNames = {stopped: '待启动', starting: '启动中', running: '运行中', stopping: '停止中', exited: '已退出', failed: '启动失败', orphaned: '需要人工确认'};
const nameOf = dir => dir.split(/[\\/]/).filter(Boolean).at(-1) || dir;
const statusName = service => service?.status === 'starting' && service.phase === 'preparing' ? t("准备中") : service?.status === 'stopped' && service.startedAt ? t("已停止") : t(statusNames[service?.status] || '已添加');
let selected = null, stream = null, state = createViewState(), busy = false, pendingAction = null, pendingProject = null;
let renderTimer = null, copyTimer = null, displayedText = null, displayedQuery = null;
let logView = buildLogView('');
let workspace = {folders: [], projects: []}, editingFolderId = null;
const collapsedFolders = new Set();
let searchSnapshot = null, searchRanges = [], searchActive = -1, displayedActive = -1, followBeforeSearch = true;
let draggedProject = null, keyboardProject = null;
let importRequestId = null;
let removalProject = null, removalReturnFocus = null;

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', `#icon-${name}`);
  svg.append(use);
  return svg;
}

function notice(message, success = false) {
  toast.show(message,success);
}

async function request(url, args = null) {
  const response = await fetch(url, args === null ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(args)});
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = new Error(translateMessage(result.error?.message) || t("本机后台暂时无法处理请求"));
    error.code = result.error?.code;
    error.details = result.error?.details;
    if (error.code === 'UNAUTHORIZED') showAuthHelp();
    throw error;
  }
  return result.data;
}
const call = (tool, args = {}) => request(`/api/tools/${tool}`, args);

function showAuthHelp() {
  stream?.close();stream = null;
  $('auth-help').hidden = false;
  connected(false, t("需要重新打开面板"));
  $('stream-status').textContent = t("面板会话已失效");
}

function connected(value, label) {
  $('connection').classList.toggle('online', value);
  $('connection-label').textContent = label;
  $('stream-dot').classList.toggle('online', value);
}

function setBusy(value, action = null) {
  busy = value;
  pendingAction = value ? action : null;
  for (const id of ['import-project', 'import-empty', 'create-folder', 'folder-save', 'refresh', 'refresh-runtime', 'focus-add']) $(id).disabled = value;
  for (const button of document.querySelectorAll('.folder-import, .folder-rename, .folder-remove')) button.disabled = value;
  $('import-status').hidden = pendingAction !== 'import';
  $('sidebar').setAttribute('aria-busy', String(value && action === 'import'));
  $('import-project').setAttribute('aria-busy', String(value && action === 'import'));
  const importing = value && action === 'import';
  // 反馈置于全局层，项目栏折叠或列表过长时也能看到；每个入口同步显示等待状态。
  document.documentElement.dataset.importing = String(importing);
  document.querySelector('.workspace').inert = importing;
  for (const id of ['import-empty', 'focus-add']) {
    $(id).setAttribute('aria-busy', String(importing));
    $(id).lastChild.textContent = importing ? t("正在导入…") : t("导入项目");
  }
  $('folder-form').setAttribute('aria-busy', String(value && action === 'folder'));
  $('refresh').classList.toggle('action-pending', value && action === 'refresh');
  renderService();
  renderProjects();
}

function mergeService(service) {
  const old = projects.get(service.projectKey) || {projectKey: service.projectKey, dir: service.dir, name: nameOf(service.dir)};
  // 保持项目对象身份，异步检查、配置编辑和状态推送可以更新同一条记录。
  old.service = service;
  if(service.error?.details?.build)old.buildInstructions=service.error.details.build;
  let configChanged = false;
  if (!old.profileEdited && old.config && service.profile && old.config.profile !== service.profile) {
    old.config.profile = service.profile;old.profileAutomatic = !['explicit', 'runtime-log'].includes(service.profileSource);configChanged = true;
  }
  if (!old.jdkEdited && old.config && service.jdkHome && old.config.jdk !== service.jdkHome) {old.config.jdk = service.jdkHome;configChanged = true;}
  projects.set(service.projectKey, old);
  if (selected === service.projectKey && configChanged) restoreConfig(old);
  renderProjects();
  if (selected === service.projectKey) renderService();
}

function applyWorkspace(data) {
  const removed=workspace.projects.filter(record=>!data.projects.some(next=>next.projectKey===record.projectKey));
  workspace = data;
  for(const record of removed){const service=projects.get(record.projectKey)?.service;if(!['starting','running','stopping','orphaned'].includes(service?.status))projects.delete(record.projectKey);}
  for (const record of data.projects) {
    const item = projects.get(record.projectKey) || {};
    Object.assign(item, record);
    projects.set(record.projectKey, item);
  }
  const imported = new Map(data.projects.map(item => [item.projectKey, item.folderId]));
  for (const item of projects.values()) item.folderId = imported.get(item.projectKey) ?? null;
  if (selected && !projects.has(selected)) {
    stream?.close();stream=null;selected=null;
    state=createViewState();endSearch(false);
    $('service-panel').hidden=true;$('empty-state').hidden=false;
    document.documentElement.dataset.serviceSelected='false';
    if(projects.size)void selectProject(projects.keys().next().value);else connectEvents();
  }
  renderProjects();
}

function projectRow(p) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.projectKey = p.projectKey;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `project-item${selected === p.projectKey ? ' selected' : ''}`;
  button.dataset.projectKey = p.projectKey;
  button.setAttribute('aria-pressed', String(selected === p.projectKey));
  button.title = `${p.name || nameOf(p.dir)}\n${p.dir}`;
  const mark = document.createElement('span');mark.className = 'project-icon';mark.append(icon('spring-boot'));
  const block = document.createElement('span');block.className = 'project-text';
  const name = document.createElement('span');name.className = 'project-name';name.textContent = p.name || nameOf(p.dir);
  const sub = document.createElement('span'), status = p.service?.status;
  sub.className = `project-sub${status === 'running' ? ' live' : ['failed', 'orphaned'].includes(status) ? ' failed' : ''}`;
  sub.dataset.status = status || 'stopped';
  const dot = document.createElement('i');dot.className = 'service-dot';dot.setAttribute('role', 'img');dot.setAttribute('aria-label', statusName(p.service));dot.title = statusName(p.service);
  const profile = document.createElement('span');profile.className = 'project-profile';profile.textContent = p.service?.profile || p.info?.activeProfile || t("应用配置");profile.title = p.service?.profile ? t("运行 Profile：{0}", p.service.profile) : p.info?.activeProfile ? t("配置 Profile：{0}", p.info.activeProfile) : t("由应用配置决定");
  sub.append(dot, profile);
  block.append(name, sub);button.append(mark, block);
  let dragged = false, origin = null;
  button.addEventListener('click', event => { if (dragged) {event.preventDefault();dragged = false;return;} void selectProject(p.projectKey); });
  const actions = document.createElement('div');actions.className = 'project-actions';
  const enabled = availableActions(p.service || {status: 'stopped'}, busy);
  for (const [action, label, symbol] of [['start', t("启动"), 'play'], ['stop', t("停止"), 'stop'], ['restart', t("重启"), 'arrow-clockwise']]) {
    const active = ['starting', 'running', 'stopping'].includes(status);
    if (action === 'start' ? active : !active) continue;
    const control = actionButton(`${label} ${name.textContent}`, symbol, `project-${action}`, () => void operate(action, p.projectKey));
    control.disabled = !enabled[action];actions.append(control);
    if(pendingProject===p.projectKey&&pendingAction===action){
      control.classList.add('action-pending');control.setAttribute('aria-busy','true');
      control.setAttribute('aria-label',t("正在{0} {1}", label, name.textContent));control.title=t("正在{0}，请稍候", label);
    }
  }
  // 两个入口共用确认与后台保护，不要求先选中服务。
  const remove = actionButton(t('移除服务 {0}', name.textContent), 'trash', 'project-remove', () => removeProject(p.projectKey));
  remove.disabled = !canRemoveProject(p);
  actions.append(remove);
  row.title = t("拖动调整顺序或移入其他文件夹；Ctrl+Shift+↑/↓ 调整顺序，Ctrl+Shift+M 移动到文件夹");
  // 内部项目拖动使用指针捕获，兼容嵌入式浏览器，不接收外部路径或文件拖入。
  button.addEventListener('pointerdown', event => {
    if (busy || event.button !== 0) return;
    dragged = false;origin = [event.clientX, event.clientY];button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', event => {
    if (!origin || busy) return;
    if (!dragged && Math.hypot(event.clientX-origin[0], event.clientY-origin[1]) < 6) return;
    dragged = true;draggedProject = p.projectKey;row.classList.add('dragging');
    for (const target of document.querySelectorAll('.drop-target, .drop-before, .drop-after')) target.classList.remove('drop-target','drop-before','drop-after');
    const target = projectDropTarget(event, p);
    if (target?.row) target.row.classList.add(target.after ? 'drop-after' : 'drop-before');
    else target?.group?.classList.add('drop-target');
    const list=$('projects'),rect=list.getBoundingClientRect();
    if(event.clientY<rect.top+28)list.scrollTop-=12;else if(event.clientY>rect.bottom-28)list.scrollTop+=12;
  });
  button.addEventListener('pointerup', event => {
    if (!origin) return;
    const target = dragged ? projectDropTarget(event, p) : null;
    origin = null;button.releasePointerCapture(event.pointerId);clearDrag();
    if (target) {
      void changeWorkspace({type: 'project.move', projectKey: p.projectKey, folderId: target.folderId, beforeProjectKey: target.beforeProjectKey});
    }
  });
  button.addEventListener('pointercancel', () => {origin = null;dragged = false;clearDrag();renderProjects();});
  button.addEventListener('dragstart', event => event.preventDefault());
  button.addEventListener('keydown', event => { if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'm') {event.preventDefault();keyboardProject = p.projectKey;notice(t("项目已选定，请聚焦目标文件夹或未分组，按 Enter 移动。"), true);} });
  button.addEventListener('keydown', event => {
    if(!event.ctrlKey||!event.shiftKey||!['ArrowUp','ArrowDown'].includes(event.key)||busy)return;
    event.preventDefault();const siblings=orderedProjects().filter(item=>(item.folderId||null)===(p.folderId||null)),index=siblings.findIndex(item=>item.projectKey===p.projectKey),up=event.key==='ArrowUp';
    if(up?index<=0:index>=siblings.length-1)return;
    const beforeProjectKey=up?siblings[index-1].projectKey:siblings[index+2]?.projectKey||null;
    void changeWorkspace({type:'project.move',projectKey:p.projectKey,folderId:p.folderId||null,beforeProjectKey});
  });
  row.append(button, actions);
  return row;
}

function clearDrag() {
  draggedProject = null;
  for (const node of document.querySelectorAll('.dragging, .drop-target, .drop-before, .drop-after')) node.classList.remove('dragging', 'drop-target', 'drop-before', 'drop-after');
}

function orderedProjects() {
  const imported=new Set(workspace.projects.map(item=>item.projectKey));
  return [...workspace.projects.map(item=>projects.get(item.projectKey)).filter(Boolean),...[...projects.values()].filter(item=>!imported.has(item.projectKey))];
}

function projectDropTarget(event, project) {
  const hit=document.elementFromPoint(event.clientX,event.clientY),group=hit?.closest('[data-drop-folder]');
  if(!group)return null;
  const row=hit.closest('.project-row'),folderId=group.dataset.dropFolder||null;
  if(row?.dataset.projectKey===project.projectKey)return null;
  if(!row)return {group,folderId,beforeProjectKey:null};
  const rect=row.getBoundingClientRect(),after=event.clientY>=rect.top+rect.height/2;
  const siblings=orderedProjects().filter(item=>item.projectKey!==project.projectKey&&(item.folderId||null)===folderId),index=siblings.findIndex(item=>item.projectKey===row.dataset.projectKey);
  if(index<0)return null;
  return {group,row,after,folderId,beforeProjectKey:after?siblings[index+1]?.projectKey||null:row.dataset.projectKey};
}

function dropZone(node, folderId) {
  node.dataset.dropFolder = folderId || '';
  node.addEventListener('keydown', event => {
    if (event.key === 'Enter' && keyboardProject && !busy) {
      event.preventDefault();event.stopPropagation();const key = keyboardProject;keyboardProject = null;
      void changeWorkspace({type: 'project.move', projectKey: key, folderId});
    }
  });
}

function actionButton(label, iconName, className, action) {
  const button = document.createElement('button');button.type = 'button';button.className = `icon-button ${className}`;
  button.setAttribute('aria-label', label);button.title = label;button.disabled = busy;button.append(icon(iconName));button.addEventListener('click', action);return button;
}

function renderProjects() {
  if (draggedProject) return;
  const query = $('project-search').value.trim().toLocaleLowerCase();
  const focusedKey = document.activeElement?.matches('.project-item') ? document.activeElement.dataset.projectKey : null;
  const focusedFolder = document.activeElement?.matches('.folder-toggle') ? document.activeElement.closest('.project-group').dataset.folderId : null;
  $('projects').replaceChildren();
  $('project-count').textContent = String(projects.size);
  const liveCount = [...projects.values()].filter(p => ['running', 'starting'].includes(p.service?.status)).length;
  $('workspace-summary').textContent = projects.size ? t("{0} 个项目 / {1} 个运行中", projects.size, liveCount) : t("添加项目后即可启动服务");
  const all = orderedProjects(), matchesProject = p => !query || `${p.name || nameOf(p.dir)} ${p.dir}`.toLocaleLowerCase().includes(query);
  let shown = 0;
  for (const folder of workspace.folders) {
    const children = all.filter(p => p.folderId === folder.id);
    const matching = folder.name.toLocaleLowerCase().includes(query) ? children : children.filter(matchesProject);
    if (query && !matching.length && !folder.name.toLocaleLowerCase().includes(query)) continue;
    shown++;
    const group = document.createElement('section');group.className = 'project-group';group.dataset.folderId = folder.id;
    dropZone(group, folder.id);
    const header = document.createElement('div');header.className = 'folder-heading';
    const toggle = document.createElement('button');toggle.type = 'button';toggle.className = 'folder-toggle';toggle.append(icon('caret-down'), icon('folder-simple'));
    const name = document.createElement('span');name.className = 'folder-title';name.textContent = folder.name;
    const count = document.createElement('span');count.className = 'folder-count';count.textContent = String(children.length);
    const open = !!query || !collapsedFolders.has(folder.id);toggle.setAttribute('aria-expanded', String(open));toggle.title = folder.name;toggle.append(name, count);
    toggle.setAttribute('aria-controls', `folder-${folder.id}`);
    toggle.addEventListener('click', () => { if (collapsedFolders.has(folder.id)) collapsedFolders.delete(folder.id);else collapsedFolders.add(folder.id);renderProjects(); });
    const add = actionButton(t("导入项目到 {0}", folder.name), 'plus', 'folder-import', () => void importProject(folder.id));
    const menu = document.createElement('details');menu.className = 'folder-menu';
    const summary = document.createElement('summary');summary.className = 'icon-button';summary.setAttribute('aria-label', t("管理文件夹 {0}", folder.name));summary.append(icon('sliders-horizontal'));
    const actions = document.createElement('div');actions.className = 'folder-menu-panel';
    const rename = document.createElement('button');rename.type = 'button';rename.className = 'folder-rename';rename.textContent = t("重命名");rename.disabled = busy;rename.addEventListener('click', () => openFolderForm(folder));
    const remove = document.createElement('button');remove.type = 'button';remove.className = 'folder-remove';remove.textContent = t("移除文件夹");remove.title = t("项目回到未分组，不修改磁盘文件");remove.disabled = busy;remove.addEventListener('click', () => void changeWorkspace({type: 'folder.remove', id: folder.id}));
    actions.append(rename, remove);menu.append(summary, actions);header.append(toggle, add, menu);group.append(header);
    const list = document.createElement('div');list.className = 'folder-projects';list.hidden = !open;
    list.id = `folder-${folder.id}`;
    for (const item of matching) list.append(projectRow(item));
    if (!matching.length) { const hint = document.createElement('p');hint.className = 'folder-empty';hint.textContent = t("暂无项目，点击 + 导入");list.append(hint); }
    group.append(list);$('projects').append(group);
  }
  const root = all.filter(p => !p.folderId).filter(matchesProject);
  const rootGroup = document.createElement('section');rootGroup.className = 'root-projects';dropZone(rootGroup, null);
  if (workspace.folders.length) { const heading = document.createElement('button');heading.type = 'button';heading.className = 'ungrouped-title';heading.textContent = t("未分组");heading.title = t("将项目拖到这里，或按 Enter 移入");rootGroup.append(heading); }
  for (const item of root) { rootGroup.append(projectRow(item));shown++; }
  $('projects').append(rootGroup);
  if (focusedKey) {
    for (const button of $('projects').querySelectorAll('.project-item')) if (button.dataset.projectKey === focusedKey) button.focus({preventScroll: true});
  }
  if (focusedFolder) {
    for (const group of $('projects').querySelectorAll('.project-group')) if (group.dataset.folderId === focusedFolder) group.querySelector('.folder-toggle').focus({preventScroll: true});
  }
  if (!shown) {
    const empty = document.createElement('p');
    empty.className = 'sidebar-empty';
    empty.textContent = query ? t("没有匹配的项目或文件夹。") : t("点击右上角加号，从电脑导入项目。也可以先创建文件夹。");
    $('projects').append(empty);
  }
}

function updateUptime() {
  const service = projects.get(selected)?.service;
  $('service-uptime').textContent = service && ['starting', 'running', 'stopping'].includes(service.status)
    ? formatUptime(service.startedAt) : service?.startedAt ? t("已结束") : t("未启动");
}

function renderService() {
  const p = projects.get(selected);
  if (!p) return;
  const service = p.service || {status: 'stopped'};
  const active = ['starting', 'running', 'stopping'].includes(service.status);
  $('service-name').textContent = p.name || nameOf(p.dir);
  $('service-name').title = p.dir;
  $('log-service-name').textContent = p.name || nameOf(p.dir);
  $('service-dir').textContent = p.dir;
  $('service-dir').title = p.dir;
  $('service-status').textContent = statusName(service);
  $('service-status').className = `status-label${service.status === 'running' ? ' live' : ['failed', 'orphaned'].includes(service.status) ? ' failed' : ''}`;
  // 没有显式覆盖时不猜测应用实际端口，更不能把它表示成未监听。
  $('service-port').textContent = service.port ? String(service.port) : t("采用应用配置");
  $('service-port').title = service.port ? t("启动时明确指定的端口") : t("没有显式指定端口，实际值由应用配置决定");
  $('service-mode').textContent = {jar: t("可执行 jar"), classpath: 'classes / classpath'}[service.mode] || t("自动选择");
  $('service-pid').textContent = service.pid ? `${service.pid}${active ? '' : t("（已退出）")}` : t("未启动");
  updateUptime();
  const ready = service.status === 'running' && !!service.readiness?.ready;
  $('readiness').classList.toggle('ready', ready);
  $('readiness-icon').setAttribute('href', ready ? '#icon-check' : '#icon-terminal-window');
  $('readiness-text').textContent = service.status === 'stopping' ? t("正在等待服务退出") : translateMessage(service.readiness?.reason) || (active ? t("进程运行中，就绪未确认") : t("服务尚未启动"));
  $('readiness').title = $('readiness-text').textContent;
  const error = p.operationError || service.error?.message;
  $('service-error').hidden = !error;
  $('service-error').textContent = translateMessage(error);
  $('build-help').hidden = !p.buildInstructions;
  if($('build-command').value!==(p.buildInstructions?.command||''))$('build-command').value=p.buildInstructions?.command||'';
  $('build-help-reason').textContent = translateMessage(p.buildInstructions?.reason);
  const actions = availableActions(service, busy);
  for (const action of ['start', 'stop', 'restart']) $(action).disabled = !actions[action];
  $('start').hidden = active;
  $('stop').hidden = !active;
  $('restart').hidden = !service.startedAt || service.status === 'orphaned';
  $('restart').classList.toggle('primary-action', active);
  $('remove-project').disabled=!canRemoveProject(p);
  $('start-label').textContent = pendingAction === 'start' ? t("正在启动") : t("启动服务");
  $('stop-label').textContent = pendingAction === 'stop' ? t("正在停止") : t("停止");
  $('restart-label').textContent = pendingAction === 'restart' ? t("正在重启") : active ? t("重启服务") : t("重启");
}

function updateConfigSummary() {
  const mode = {auto: t("自动选择产物"), jar: t("可执行 jar"), classpath: t("完整 classpath")}[$('mode').value];
  const profile = $('profile').value.trim();
  const p = projects.get(selected), jdk = p?.info?.jdks?.find(item => item.home === $('jdk').value);
  $('config-summary').textContent = [profile || p?.info?.activeProfile || t("应用默认"), jdk?.major ? `Java ${jdk.major}` : '', mode].filter(Boolean).join(' / ');
}

function rememberConfig() {
  const p = projects.get(selected);
  if (p) p.config = Object.fromEntries(configIds.map(id => [id, $(id).value]));
  updateConfigSummary();
  $('jdk-manual-field').hidden = $('jdk').value !== '__custom__';
}

function restoreConfig(p) {
  const info = p.info || {}, config = p.config ||= {};
  if (config.profile === undefined) {
    config.profile = p.service?.profile || info.activeProfile || '';
    p.profileAutomatic = !p.service?.profile || !['explicit', 'runtime-log'].includes(p.service.profileSource);
  }
  if (config.jdk === undefined) config.jdk = p.service?.jdkHome || info.recommendedJdkHome || '';
  const option = (value, label, disabled = false) => {const node = document.createElement('option');node.value = value;node.textContent = label;node.disabled = disabled;return node;};
  $('profile').replaceChildren(option('', t("自动 · {0}", info.activeProfile || t("应用默认"))));
  const profiles = new Set([...(info.profiles || []), info.activeProfile, p.service?.profile, config.profile].filter(Boolean));
  for (const name of profiles) {const node=option(name,name);if(name===info.activeProfile)node.dataset.badge=t("项目默认");$('profile').append(node);}
  $('jdk').replaceChildren(option('', t("自动选择兼容 JDK")));
  for (const jdk of info.jdks || []) $('jdk').append(option(jdk.home, `${jdk.major ? `Java ${jdk.major}` : t("未知版本")} · ${jdk.vendor || nameOf(jdk.home)} · ${jdk.home}${jdk.compatible ? '' : `（${translateMessage(jdk.reason)}）`}`, !jdk.compatible));
  if (config.jdk && config.jdk !== '__custom__' && !(info.jdks || []).some(jdk => jdk.home === config.jdk)) $('jdk').append(option(config.jdk, t("上次使用 · {0}", config.jdk)));
  $('jdk').append(option('__custom__', t("选择自定义 JDK 目录…")));
  for (const id of configIds) $(id).value = p.config?.[id] ?? (id === 'mode' ? 'auto' : '');
  $('profile').disabled = !p.info;
  $('jdk').disabled = !p.info?.jdks;
  refreshSelectFields();
  $('jdk-manual-field').hidden = $('jdk').value !== '__custom__';
  $('profile-hint').textContent = info.profileUnresolved ? t("存在未解析占位符，自动模式交给应用处理") : info.profileSource ? `${p.profileAutomatic ? t("自动识别") : t("项目默认")}：${info.profileSource}${p.profileAutomatic ? t("；启动沿用应用配置") : ''}` : info.profiles?.length ? t("从项目配置文件读取，可选择需要的环境") : p.info ? t("未声明 Profile，使用应用默认配置") : t("正在读取项目配置…");
  const chosen = info.jdks?.find(jdk => jdk.home === config.jdk);
  $('jdk-hint').textContent = chosen ? t("{0} · {1} · 项目要求 Java {2}+", translateMessage(chosen.source), chosen.version, info.requiredJavaMajor || 8) : info.jdks ? t("发现 {0} 个安装目录 · 项目要求 Java {1}+", info.jdks.length, info.requiredJavaMajor || 8) : t("正在扫描本机安装目录…");
  const warnings = info.warnings || [];$('runtime-warning').textContent = warnings.map(translateMessage).join('; ');$('runtime-warning').hidden = !warnings.length;
  updateConfigSummary();
}

async function loadRuntimeOptions(p, force = false) {
  if (!force && p.info?.jdks) return;
  p.loadingInfo ||= call('spring_boot_inspect', {dir: p.dir});
  try {
    p.info = await p.loadingInfo;
    if (!p.profileEdited && p.profileAutomatic !== false) {p.config ||= {};delete p.config.profile;}
    if (!p.jdkEdited) {p.config ||= {};delete p.config.jdk;}
    if (selected === p.projectKey) restoreConfig(p);
    else {
      p.config ||= {};p.config.profile ??= p.service?.profile || p.info.activeProfile || '';
      p.profileAutomatic ??= !p.service?.profile || p.service.profileSource !== 'explicit';
      p.config.jdk ??= p.service?.jdkHome || p.info.recommendedJdkHome || '';
    }
    renderProjects();
  } finally {p.loadingInfo = null;}
}

function renderLogRows() {
  const fragment = document.createDocumentFragment();
  if (!logView.lines.length) {
    const empty = document.createElement('div');
    empty.className = 'log-empty';
    const title = document.createElement('span'), hint = document.createElement('p');
    title.textContent = t("等待服务输出");
    hint.textContent = t("启动服务后，标准输出和错误日志会显示在这里。");
    empty.append(icon('terminal-window'), title, hint);
    fragment.append(empty);
  }
  for (const line of logView.lines) {
    const row = document.createElement('div'), number = document.createElement('span'), content = document.createElement('span');
    row.className = 'log-row';
    row.classList.toggle('search-hit-row', line.matched);
    row.classList.toggle('search-active-row', line.hits.some(hit => hit.index === searchActive));
    number.className = 'log-line-number';
    number.setAttribute('aria-hidden', 'true');
    number.textContent = String(line.number);
    content.className = 'log-line';
    const parts = splitLogLevel(line.text);
    const levelStart = parts.prefix.length, levelEnd = levelStart + parts.level.length;
    const colors = (searchSnapshot !== null ? searchRanges : state.displayRanges).filter(r => r.end > line.offset && r.start < line.offset + line.text.length).map(r => ({...r, start: Math.max(0, r.start-line.offset), end: Math.min(line.text.length, r.end-line.offset)}));
    const boundaries = [...new Set([0, line.text.length, ...(parts.level ? [levelStart, levelEnd] : []), ...line.hits.flatMap(hit => [hit.start, hit.end]), ...colors.flatMap(r => [r.start, r.end])])].sort((a, b) => a - b);
    let hitPosition = 0;
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i], end = boundaries[i + 1];
      while (hitPosition < line.hits.length && line.hits[hitPosition].end <= start) hitPosition++;
      const hit = line.hits[hitPosition]?.start <= start && line.hits[hitPosition]?.end >= end ? line.hits[hitPosition] : null;
      const span = document.createElement(hit ? 'mark' : 'span');
      span.textContent = line.text.slice(start, end);
      if (hit) {
        span.dataset.matchIndex = String(hit.index);
        span.className = `search-keyword${hit.index === searchActive ? ' current-match' : ''}`;
        if (hit.index === searchActive) span.setAttribute('aria-current', 'true');
      } else if (parts.level && start >= levelStart && end <= levelEnd) span.className = `log-level ${parts.level.toLowerCase()}`;
      else if (parts.level && end <= levelStart) span.className = 'log-prefix';
      const color = colors.find(r => r.start <= start && r.end >= end)?.style;
      // 颜色值只允许 RGB；不用 HTML，也不接受日志提供的任意 CSS。
      if (color && !hit) {
        if (/^#[\da-f]{6}$/i.test(color.fg)) span.style.color = color.fg;
        if (/^#[\da-f]{6}$/i.test(color.bg)) span.style.backgroundColor = color.bg;
        if (color.bold) span.style.fontWeight = '700';
        if (color.italic) span.style.fontStyle = 'italic';
        if (color.underline) span.style.textDecoration = 'underline';
      }
      content.append(span);
    }
    if (!line.text) content.append(document.createTextNode('\u200b'));
    // 所有应用输出都经过文本节点，保留 HTML 原文但不解释为标记。
    row.append(number, content);
    fragment.append(row);
  }
  const previousScroll = $('logs').scrollTop;
  $('logs').replaceChildren(fragment);
  if (!$('follow').checked || state.paused || searchSnapshot !== null) $('logs').scrollTop = previousScroll;
}

function renderLogs() {
  renderTimer = null;
  const query = $('search').value.trim();
  const text = searchSnapshot ?? state.displayText;
  if (text !== displayedText || query !== displayedQuery || searchActive !== displayedActive) {
    displayedText = text;
    displayedQuery = query;
    logView = buildLogView(displayedText, query, undefined, searchActive < 0 ? 0 : searchActive);
    searchActive = logView.activeIndex;
    displayedActive = searchActive;
    renderLogRows();
  }
  const searching = searchSnapshot !== null;
  $('search-count').textContent = query ? `${searchActive < 0 ? 0 : searchActive + 1} / ${logView.matched}` : '';
  $('search-prev').disabled = !logView.matched;
  $('search-next').disabled = !logView.matched;
  $('search-close').disabled = !searching;
  $('search-status').hidden = !searching || state.dismissedHints.includes('search');
  $('follow').disabled = searching;
  $('pause').disabled = searching;
  $('log-gap').hidden = !state.gap || state.gapDismissed;
  $('log-warning').hidden = !state.persistenceError || state.dismissedHints.includes('persistence');
  $('log-warning-text').textContent = translateMessage(state.persistenceError);
  $('log-limit').hidden = (!logView.omitted && !logView.clippedHighlights) || state.dismissedHints.includes('limit');
  $('log-limit-text').textContent = [logView.omitted ? t("显示第 {0} 至 {1} 行，检索覆盖整个缓冲，可跳转到较早命中。", logView.lines[0].number, logView.lines.at(-1).number) : '', logView.clippedHighlights ? t("当前窗口限制了高亮数量，仍可定位全部匹配。") : ''].filter(Boolean).join(' ');
  $('log-meta').textContent = state.paused ? t("已暂停显示") : logView.total ? t("{0} 行", logView.total) : t("等待输出");
  $('log-meta').classList.toggle('paused', state.paused);
  $('log-size').textContent = `${(state.textBytes / 1024).toFixed(1)} / 512 KiB`;
  $('pause-label').textContent = state.paused ? t("继续") : t("暂停");
  $('pause-icon').setAttribute('href', state.paused ? '#icon-play' : '#icon-pause');
  $('pause').setAttribute('aria-pressed', String(state.paused));
  $('pause').title = state.paused ? t("继续显示最新日志") : t("暂停显示，后台继续收集日志");
  $('jump-bottom').hidden = searching || $('follow').checked || state.paused || !logView.lines.length;
  if ($('follow').checked && !state.paused && !searching) $('logs').scrollTop = $('logs').scrollHeight;
}

function startSearch() {
  if (searchSnapshot !== null) return;
  state=reduceEvent(state,{type:'restore-hint',hint:'search'});
  searchSnapshot = state.displayText;
  searchRanges = state.displayRanges;
  followBeforeSearch = $('follow').checked;
  $('follow').checked = false;
  searchActive = -1;
  renderLogs();
}

function endSearch(render = true) {
  if (searchSnapshot !== null) $('follow').checked = followBeforeSearch;
  searchSnapshot = null;searchRanges = [];searchActive = -1;displayedActive = -2;
  $('search').value = '';
  if (render) renderLogs();
}

function revealMatch() {
  // 仅滚动日志容器，避免 scrollIntoView 将整个工作台带走。
  const mark = $('logs').querySelector('.current-match');
  if (!mark) return;
  const viewport = $('logs').getBoundingClientRect(), target = mark.getBoundingClientRect();
  $('logs').scrollTop += target.top - viewport.top - viewport.height / 2 + target.height / 2;
  if (target.left < viewport.left || target.right > viewport.right) $('logs').scrollLeft += target.left - viewport.left - viewport.width / 2;
}

function navigateSearch(delta) {
  if (!logView.matched) return;
  searchActive = stepMatch(searchActive, delta, logView.matched);
  renderLogs();revealMatch();
}

function scheduleLogs() {
  if (!renderTimer) renderTimer = setTimeout(renderLogs, 120);
}

function connectEvents(dir) {
  stream?.close();
  const source = new EventSource(`/api/events${dir ? `?dir=${encodeURIComponent(dir)}&after=${state.receivedSeq}` : ''}`);
  stream = source;
  source.addEventListener('services', event => {
    if (source !== stream) return;
    const services = JSON.parse(event.data);
    for (const service of services) mergeService(service);
    if (!selected && services.length) void selectProject(services[0].projectKey);
  });
  source.addEventListener('status', event => {
    if (source !== stream) return;
    const service = JSON.parse(event.data);
    mergeService(service);
    if (!selected) void selectProject(service.projectKey);
  });
  source.addEventListener('workspace', event => {
    if (source !== stream) return;
    const data = JSON.parse(event.data);applyWorkspace(data);
    if (!selected && data.projects.length) void selectProject(data.projects[0].projectKey);
  });
  source.addEventListener('project-removed', event => {
    if(source!==stream)return;
    const {projectKey}=JSON.parse(event.data);
    projects.delete(projectKey);
    applyWorkspace({...workspace,projects:workspace.projects.filter(item=>item.projectKey!==projectKey)});
  });
  source.addEventListener('import-progress', event => {
    if(source!==stream)return;
    const progress=JSON.parse(event.data);
    if(pendingAction==='import'&&progress.requestId===importRequestId)$('import-status-text').textContent=translateMessage(progress.message);
  });
  for (const type of ['snapshot', 'log', 'gap']) source.addEventListener(type, event => {
    if (source !== stream) return;
    state = reduceEvent(state, {type, data: JSON.parse(event.data)});
    scheduleLogs();
  });
  source.onopen = () => {
    if (source !== stream) return;
    connected(true, t("本机后台已连接"));
    $('stream-status').textContent = t("实时连接");
  };
  source.onerror = async () => {
    if (source !== stream) return;
    connected(false, t("正在重连"));
    $('stream-status').textContent = t("连接中断，正在重连");
    // EventSource 不暴露 HTTP 状态，用同源请求识别失效会话，避免无限认证重连。
    try { await request('/api/workspace'); } catch (error) { if (error.code === 'UNAUTHORIZED') notice(t("面板会话已失效，请使用打开命令生成新链接。")); }
  };
}

function setSidebar(open) {
  document.documentElement.dataset.sidebarOpen = String(open);
  $('toggle-sidebar').setAttribute('aria-expanded', String(open));
  $('toggle-sidebar').setAttribute('aria-label', open ? t("收起项目列表") : t("展开项目列表"));
}

async function selectProject(key) {
  const p = projects.get(key);
  if (!p || selected === key && stream) return;
  endSearch(false);
  selected = key;
  document.documentElement.dataset.serviceSelected = 'true';
  state = reduceEvent(state, {type: 'project', projectKey: key});
  $('empty-state').hidden = true;
  $('service-panel').hidden = false;
  restoreConfig(p);
  renderProjects();
  renderService();
  renderLogs();
  connectEvents(p.dir);
  setSidebar(false);
  try {
    await loadRuntimeOptions(p);
    if (selected === key) mergeService(await call('spring_boot_status', {dir: p.dir}));
  } catch (error) {
    if (selected === key) notice(error.message);
  }
}

function sidebarError(message = '') {
  $('sidebar-error').textContent = message;$('sidebar-error').hidden = !message;
}

function folderError(message = '') {
  $('folder-error').textContent = message;$('folder-error').hidden = !message;
  $('folder-name').setAttribute('aria-invalid', String(!!message));
}

function openFolderForm(folder = null) {
  if (busy) return;
  editingFolderId = folder?.id || null;
  $('folder-form-label').textContent = folder ? t("重命名文件夹") : t("新建文件夹");
  $('folder-save').textContent = folder ? t("保存") : t("创建");
  $('folder-name').value = folder?.name || '';
  folderError();$('folder-form').hidden = false;setSidebar(true);$('folder-name').focus();
}

async function changeWorkspace(command) {
  if (busy) return false;
  sidebarError();setBusy(true, 'folder');
  try {
    const next=await request('/api/workspace/command', command);
    if(command.type==='project.remove')projects.delete(command.projectKey);
    applyWorkspace(next);
    if (command.type === 'folder.remove') notice(t("文件夹已移除，项目已回到未分组。磁盘文件保持原样。"), true);
    if (command.type === 'project.remove') notice(t("项目已从启动器移除，磁盘文件保持原样。"), true);
    return true;
  } catch (error) { sidebarError(error.message);renderProjects();return false; }
  finally { setBusy(false); }
}

async function saveFolder(event) {
  event.preventDefault();if (busy) return;
  let saved = false;
  folderError();setBusy(true, 'folder');
  try {
    const command = editingFolderId ? {type: 'folder.rename', id: editingFolderId, name: $('folder-name').value} : {type: 'folder.create', name: $('folder-name').value};
    applyWorkspace(await request('/api/workspace/command', command));
    $('folder-form').hidden = true;editingFolderId = null;saved = true;
  } catch (error) { folderError(error.message); }
  finally { setBusy(false);if (saved) $('create-folder').focus(); }
}

async function importProject(folderId = null) {
  if (busy) return;
  sidebarError();setSidebar(true);setBusy(true, 'import');
  importRequestId=crypto.randomUUID();
  $('import-status-text').textContent=t("正在打开系统目录窗口，请选择项目目录…");
  try {
    const result = await request('/api/workspace/import', {folderId,requestId:importRequestId});
    if (result.cancelled) { notice(t("已取消导入项目。"), true); return; }
    if (folderId) collapsedFolders.delete(folderId);
    applyWorkspace(result.workspace);
    for (const info of result.projects) projects.get(info.projectKey).info = info;
    $('import-status-text').textContent=t("项目已导入，正在读取 Profile 和 JDK…");
    await selectProject(result.projects[0].projectKey);
    setSidebar(false);
    renderProjects();
    notice(t("已导入 {0} 个应用模块{1}。", result.projects.length, result.truncated ? t("；扫描达到上限，可继续选择较小目录导入") : ''), !result.truncated);
    if (result.warnings.length) sidebarError(result.warnings.join('；'));
  } catch (error) { sidebarError(error.message); }
  finally { importRequestId=null;setBusy(false); }
}

async function operate(action, key = selected) {
  const p = projects.get(key);
  if (!p || busy) return;
  if (action === 'start' && key === selected && !$('port').checkValidity()) {
    $('config').open = true;
    $('port').reportValidity();
    return;
  }
  p.operationError = null;
  p.buildInstructions = null;
  pendingProject=key;
  setBusy(true, action);
  if(action==='stop')notice(t("{0}：正在停止服务，日志将持续输出至完全退出…", p.name || nameOf(p.dir)),true);
  try {
    // 从列表启动另一项时，先切换工作区与日志订阅，再提交启动请求。
    if(['start','restart'].includes(action)&&selected!==key)await selectProject(key);
    if(action==='start'&&!$('port').checkValidity()){$('config').open=true;$('port').reportValidity();return;}
    const args = {dir: p.dir};
    if (action === 'start') {
      await loadRuntimeOptions(p);
      if (key === selected) rememberConfig();
      const config = p.config || {};
      args.mode = config.mode || 'auto';
      const port = Number(config.port);
      if (port) args.port = port;
      if (config.profile && !p.profileAutomatic) args.profile = config.profile;
      const jdkHome = config.jdk === '__custom__' ? config['jdk-manual'] : config.jdk;
      if (jdkHome?.trim()) args.jdkHome = jdkHome.trim();
      if (config.jdk === '__custom__' && !jdkHome?.trim()) throw new Error(t("请填写自定义 JDK 目录"));
      for (const [id, field] of [['jar', 'jarPath'], ['main-class', 'mainClass'], ['health-url', 'healthUrl']]) {
        if (config[id]?.trim()) args[field] = config[id].trim();
      }
      for (const [id, field] of [['classpath', 'classpath'], ['jvm', 'jvmArgs']]) {
        if (config[id]?.trim()) args[field] = config[id].split('\n').map(line => line.trim()).filter(Boolean);
      }
    }
    mergeService(await call(`spring_boot_${action}`, args));
    if (action === 'start' && selected === p.projectKey) connectEvents(p.dir);
    notice(t("{0}：{1}。",p.name || nameOf(p.dir),{start:t("启动请求已提交"),stop:t("服务已停止"),restart:t("重启请求已提交")}[action]),true);
  } catch (error) {
    p.operationError = error.code === 'BUILD_REQUIRED' ? t("{0}。完成构建后再点击启动。", error.message) : error.message;
    p.buildInstructions = error.details?.build || null;
    if(p.buildInstructions&&selected===p.projectKey)$('build-help').open=true;
    notice(t("{0}：{1}",p.name || nameOf(p.dir),translateMessage(p.operationError)));
  } finally { pendingProject=null;setBusy(false); }
}

function focusLogs(enabled) {
  document.documentElement.dataset.logFocus = String(enabled);
  const label = enabled ? t("退出日志专注视图") : t("展开日志专注视图");
  $('expand-logs').setAttribute('aria-label', label);
  $('expand-logs').setAttribute('aria-pressed', String(enabled));
  $('expand-logs').title = enabled ? `${label}（Esc）` : label;
  $('expand-icon').setAttribute('href', enabled ? '#icon-arrows-in-simple' : '#icon-arrows-out-simple');
  if ($('follow').checked && !state.paused && searchSnapshot === null) $('logs').scrollTop = $('logs').scrollHeight;
}

function canRemoveProject(p) {
  return !!p && !busy && !['preparing', 'starting', 'running', 'stopping', 'orphaned'].includes(p.service?.status);
}
function removeProject(projectKey) {
  const p=projects.get(projectKey);
  if(!canRemoveProject(p))return;
  removalProject=projectKey;removalReturnFocus=document.activeElement;
  $('remove-dialog-name').textContent=p.name||nameOf(p.dir);$('remove-dialog-error').hidden=true;
  $('remove-dialog-confirm').disabled=false;$('remove-dialog-cancel').disabled=false;
  $('remove-project-dialog').showModal();
}
$('remove-dialog-cancel').addEventListener('click',()=>$('remove-project-dialog').close());
$('remove-project-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
$('remove-project-dialog').addEventListener('close',()=>{removalProject=null;const focus=removalReturnFocus?.isConnected?removalReturnFocus:$('projects').querySelector('.project-item')||$('import-project');focus.focus({preventScroll:true});removalReturnFocus=null;});
$('remove-dialog-confirm').addEventListener('click',async()=>{
  const p=projects.get(removalProject);
  if(!canRemoveProject(p)){$('remove-dialog-error').textContent=t("服务状态已变化，请停止服务后再移除。");$('remove-dialog-error').hidden=false;return;}
  $('remove-dialog-confirm').disabled=true;$('remove-dialog-cancel').disabled=true;
  $('remove-project-dialog').setAttribute('aria-busy','true');
  const success=await changeWorkspace({type:'project.remove',projectKey:p.projectKey});
  if(success)$('remove-project-dialog').close();
  else{$('remove-dialog-error').textContent=$('sidebar-error').textContent;$('remove-dialog-error').hidden=false;}
  $('remove-dialog-confirm').disabled=false;$('remove-dialog-cancel').disabled=false;
  $('remove-project-dialog').setAttribute('aria-busy','false');
});
$('remove-project').addEventListener('click', () => removeProject(selected));
for (const id of ['import-project', 'import-empty', 'focus-add']) $(id).addEventListener('click', () => void importProject());
$('create-folder').addEventListener('click', () => openFolderForm());
$('folder-form').addEventListener('submit', saveFolder);
$('folder-cancel').addEventListener('click', () => { $('folder-form').hidden = true;editingFolderId = null;$('create-folder').focus(); });
$('folder-name').addEventListener('input', () => folderError());
$('dismiss-log-gap').addEventListener('click', () => {state=reduceEvent(state,{type:'dismiss-gap'});renderLogs();});
for(const button of document.querySelectorAll('[data-dismiss-log-hint]'))button.addEventListener('click',()=>{state=reduceEvent(state,{type:'dismiss-hint',hint:button.dataset.dismissLogHint});renderLogs();});
$('project-search').addEventListener('input', renderProjects);
$('copy-build-command').addEventListener('click',()=>{
  // 原生选择保留 Ctrl+C 与右键复制入口，兼容嵌入式浏览器的剪贴板隔离。
  const command=$('build-command');command.focus();command.select();
  notice(t("准备命令已选中，按 Ctrl+C 复制，然后在 PowerShell 中审阅后执行。"),true);
});
$('toggle-sidebar').addEventListener('click', () => setSidebar(document.documentElement.dataset.sidebarOpen !== 'true'));
for (const id of configIds) $(id).addEventListener('input', rememberConfig);
$('profile').addEventListener('input', () => {const p = projects.get(selected);if (p) {p.profileEdited = true;p.profileAutomatic = !$('profile').value;restoreConfig(p);} });
$('jdk').addEventListener('input', () => {const p = projects.get(selected);if (p) {p.jdkEdited = !!$('jdk').value;restoreConfig(p);} });
$('refresh-runtime').addEventListener('click', async () => {
  const p = projects.get(selected);if (!p || busy) return;
  setBusy(true, 'inspect');
  try {await loadRuntimeOptions(p, true);notice(t("已重新读取 Profile 和本机 JDK，手动选择保留。"), true);}
  catch (error) {notice(error.message);}
  finally {setBusy(false);}
});

$('refresh').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true, 'refresh');
  try {
    applyWorkspace(await request('/api/workspace'));
    const services = await call('spring_boot_status');
    for (const service of services) mergeService(service);
    if (!selected && services.length) await selectProject(services[0].projectKey);
    notice(t("已同步项目列表与服务状态，不会重启服务或重新扫描项目。"), true);
  } catch (error) { notice(error.message); }
  finally { setBusy(false); }
});

for (const action of ['start', 'stop', 'restart']) $(action).addEventListener('click', () => void operate(action));
$('pause').addEventListener('click', () => {
  state = reduceEvent(state, {type: state.paused ? 'resume' : 'pause'});
  renderLogs();
});
$('search').addEventListener('focus', startSearch);
$('search').addEventListener('input', () => { startSearch();searchActive = 0;renderLogs();revealMatch(); });
$('search').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault();navigateSearch(event.shiftKey ? -1 : 1); }
});
$('search-prev').addEventListener('click', () => navigateSearch(-1));
$('search-next').addEventListener('click', () => navigateSearch(1));
$('search-close').addEventListener('click', () => { endSearch();$('logs').focus({preventScroll: true}); });
$('follow').addEventListener('change', renderLogs);
$('wrap').addEventListener('change', () => {
  $('logs').classList.toggle('no-wrap', !$('wrap').checked);
  renderLogs();
});
$('jump-bottom').addEventListener('click', () => { $('follow').checked = true; renderLogs(); });
$('expand-logs').addEventListener('click', () => focusLogs(document.documentElement.dataset.logFocus !== 'true'));
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(logView.text);
    $('copy-icon').setAttribute('href', '#icon-check');
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => $('copy-icon').setAttribute('href', '#icon-copy'), 2000);
    notice(t("当前显示的日志已复制。"), true);
  } catch { notice(t("浏览器未允许复制，请选中日志文本后手动复制。")); }
});

window.addEventListener('keydown', event => {
  if($('remove-project-dialog').open||$('app-update-dialog').open)return;
  const editing = event.target instanceof Element && (event.target.matches('input, textarea, select') || event.target.isContentEditable);
  if (event.key === 'Escape' && keyboardProject) {
    event.preventDefault();keyboardProject = null;notice(t("已取消移动项目。"), true);return;
  }
  if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey && selected) {
    event.preventDefault();
    $('search').focus();
  }
  if (event.key === 'Escape' && searchSnapshot !== null) {
    event.preventDefault();endSearch();$('logs').focus({preventScroll: true});
  } else if (event.key === 'Escape' && document.documentElement.dataset.logFocus === 'true') {
    focusLogs(false);
    $('expand-logs').focus();
  } else if (event.key === 'Escape' && document.documentElement.dataset.sidebarOpen === 'true') {
    setSidebar(false);
    $('toggle-sidebar').focus();
  }
});
const uptimeTimer = setInterval(updateUptime, 1000);
window.addEventListener('pagehide', () => {
  stream?.close();
  clearInterval(uptimeTimer);
  clearTimeout(renderTimer);
  toast.dispose();
  clearTimeout(copyTimer);
});

async function init() {
  try {
    const ticket = new URLSearchParams(location.hash.slice(1)).get('ticket');
    if (location.hash) history.replaceState(null, '', location.pathname);
    if (ticket) {
      const response = await fetch('/api/session', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ticket})});
      const result = await response.json();
      if (!result.ok) { showAuthHelp();throw new Error(result.error.message); }
    }
    const [saved, services] = await Promise.all([request('/api/workspace'), call('spring_boot_status')]);
    applyWorkspace(saved);
    $('auth-help').hidden = true;$('notice').hidden = true;
    for (const service of services) mergeService(service);
    connected(true, t("本机后台已连接"));
    void appUpdates.load();
    if (selected && projects.has(selected)) connectEvents(projects.get(selected).dir);
    else if (projects.size) await selectProject(projects.keys().next().value);
    else { renderProjects(); connectEvents(); }
  } catch (error) {
    connected(false, t("后台未连接"));
    notice(t("{0}。请从 Codex、Claude Code 或本地命令重新打开面板。", error.message));
  }
}
setupLanguage(() => {
  renderProjects();
  const p=projects.get(selected);
  if(p){restoreConfig(p);renderService();}
  displayedText=null;renderLogs();
  updateCollapseLabels();
  appUpdates.render();
});
setupSidebarResize();
setupSelectFields();
const appUpdates=setupAppUpdates({request,notice});
void init();
window.addEventListener('hashchange', () => { if (new URLSearchParams(location.hash.slice(1)).has('ticket')) void init(); });
$('copy-dashboard-command').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('dashboard-command').textContent);notice(t("打开命令已复制，请在启动器项目目录执行。"), true); }
  catch { notice(t("请手动复制上方的打开命令。")); }
});

// 折叠只改变布局，不重建日志流、选择或检索状态。
function updateCollapseLabels() {
  for (const [id,key,label] of [['collapse-projects','projectsCollapsed','项目栏'],['collapse-details','detailsCollapsed','服务信息']]) {
    $(id).textContent=(document.documentElement.dataset[key]==='true'?t('展开'):t('收起'))+t(label);
  }
}
for (const [id, key] of [['collapse-projects','projectsCollapsed'],['collapse-details','detailsCollapsed']]) {
  $(id).addEventListener('click', () => {
    const collapsed = document.documentElement.dataset[key] !== 'true';
    document.documentElement.dataset[key] = String(collapsed);
    updateCollapseLabels();
    $(id).setAttribute('aria-expanded', String(!collapsed));
  });
}
