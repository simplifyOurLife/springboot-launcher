import {createViewState,reduceEvent} from './state.mjs';
const $=id=>document.getElementById(id),projects=new Map();let selected=null,stream=null,state=createViewState(),busy=false,renderTimer=null,noticeTimer=null;
const statusNames={stopped:'待启动',starting:'启动中',running:'运行中',stopping:'停止中',exited:'已退出',failed:'启动失败',orphaned:'需要人工确认'};
const nameOf=dir=>dir.split(/[\\/]/).filter(Boolean).at(-1)||dir;
function notice(message,success=false){clearTimeout(noticeTimer);$('notice').textContent=message;$('notice').classList.toggle('success',success);$('notice').hidden=false;if(success)noticeTimer=setTimeout(()=>$('notice').hidden=true,5000);}
async function call(tool,args={}){const response=await fetch(`/api/tools/${tool}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});const result=await response.json();if(!result.ok){const error=new Error(result.error.message);error.code=result.error.code;throw error;}return result.data;}
function connected(value,label){$('connection').classList.toggle('online',value);$('connection').lastChild.textContent=label;}
function mergeService(service){const old=projects.get(service.projectKey)||{projectKey:service.projectKey,dir:service.dir,name:nameOf(service.dir)};projects.set(service.projectKey,{...old,service});renderProjects();if(selected===service.projectKey)renderService();}
function renderProjects(){
  $('projects').replaceChildren();$('project-count').textContent=String(projects.size);
  for(const p of projects.values()){
    const button=document.createElement('button');button.className=`project-item${selected===p.projectKey?' selected':''}`;button.title=p.dir;
    const icon=document.createElement('span');icon.className='project-icon';icon.textContent='SB';
    const block=document.createElement('span');block.className='project-text';const name=document.createElement('span');name.className='project-name';name.textContent=p.name||nameOf(p.dir);
    const sub=document.createElement('span');sub.className=`project-sub${p.service?.status==='running'?' live':''}`;sub.textContent=statusNames[p.service?.status]||'已添加';block.append(name,sub);button.append(icon,block);button.addEventListener('click',()=>selectProject(p.projectKey));$('projects').append(button);
  }
}
function renderService(){
  const p=projects.get(selected);if(!p)return;const service=p.service||{status:'stopped'};const active=['starting','running','stopping'].includes(service.status);
  $('service-name').textContent=p.name||nameOf(p.dir);$('service-status').textContent=statusNames[service.status]||'待启动';$('service-status').className=`status-label${active?' live':service.status==='failed'?' failed':''}`;
  $('service-port').textContent=service.port?`端口 ${service.port}`:'未监听端口';$('service-mode').textContent=service.mode==='jar'?'jar':service.mode==='classpath'?'classes':'自动选择';
  $('readiness').textContent=service.readiness?.reason||(active?'进程运行中，就绪未确认':'服务尚未启动');
  $('start').disabled=busy||active||service.status==='orphaned';$('stop').disabled=busy||!active;$('restart').disabled=busy||!service.startedAt||service.status==='orphaned';
}
function renderLogs(){
  renderTimer=null;const query=$('search').value.toLocaleLowerCase(),text=state.displayText;let output=text;
  if(query){const matches=text.split('\n').filter(line=>line.toLocaleLowerCase().includes(query));output=matches.join('\n');$('search-count').textContent=`${matches.length} 行匹配`;}else $('search-count').textContent='';
  // 应用输出始终作为文本处理，禁止通过 HTML 插值渲染。
  $('logs').textContent=output||(query?'当前缓冲没有匹配日志。':'等待服务输出…');$('log-gap').hidden=!state.gap;
  $('log-meta').textContent=state.paused?'显示已暂停':state.receivedSeq?`序号 ${state.receivedSeq}`:'等待输出';$('log-size').textContent=`${(new TextEncoder().encode(state.text).length/1024).toFixed(1)} KB / 512 KB`;
  $('pause').textContent=state.paused?'继续':'暂停';if($('follow').checked&&!state.paused)$('logs').scrollTop=$('logs').scrollHeight;
}
function scheduleLogs(){if(!renderTimer)renderTimer=setTimeout(renderLogs,120);}
function connectEvents(dir){
  stream?.close();const source=new EventSource(`/api/events${dir?`?dir=${encodeURIComponent(dir)}&after=${state.receivedSeq}`:''}`);stream=source;
  source.addEventListener('services',e=>{for(const s of JSON.parse(e.data))mergeService(s);});source.addEventListener('status',e=>mergeService(JSON.parse(e.data)));
  for(const type of ['snapshot','log','gap'])source.addEventListener(type,e=>{if(source!==stream)return;state=reduceEvent(state,{type,data:JSON.parse(e.data)});scheduleLogs();});
  source.onopen=()=>{connected(true,'本机后台已连接');$('stream-status').textContent='实时连接';};source.onerror=()=>{if(source!==stream)return;connected(false,'正在重连');$('stream-status').textContent='连接中断，正在重连';};
}
async function selectProject(key){
  selected=key;const p=projects.get(key);state=reduceEvent(state,{type:'project',projectKey:key});$('empty-state').hidden=true;$('service-panel').hidden=false;renderProjects();renderService();renderLogs();connectEvents(p.dir);
  for(const id of ['profile','jdk','jar','main-class','classpath','jvm'])$(id).value='';$('mode').value='auto';$('port').value=String(p.info?.port||p.service?.port||8080);
  try{if(!p.info)p.info=await call('spring_boot_inspect',{dir:p.dir});if(selected===key)mergeService(await call('spring_boot_status',{dir:p.dir}));}catch(e){notice(e.message);}
}
async function addProject(event){event?.preventDefault();if(busy)return;const dir=$('project-dir').value.trim();if(!dir){$('project-dir').focus();return;}
  busy=true;try{const info=await call('spring_boot_inspect',{dir});if(!info.matched)throw new Error('请选择包含 Spring Boot 入口的 Maven 应用模块');projects.set(info.projectKey,{...projects.get(info.projectKey),...info,name:nameOf(info.dir),info});$('add-panel').open=false;await selectProject(info.projectKey);notice('项目已添加。所需构建请自行完成。',true);}catch(e){notice(e.message);}finally{busy=false;renderService();}
}
async function operate(action){
  const p=projects.get(selected);if(!p||busy)return;busy=true;renderService();
  try{
    const args={dir:p.dir};if(action==='start'){
      args.mode=$('mode').value;const port=Number($('port').value);if(port)args.port=port;
      for(const [id,field]of [['profile','profile'],['jdk','jdkHome'],['jar','jarPath'],['main-class','mainClass']])if($(id).value.trim())args[field]=$(id).value.trim();
      for(const [id,field]of [['classpath','classpath'],['jvm','jvmArgs']])if($(id).value.trim())args[field]=$(id).value.split('\n').map(s=>s.trim()).filter(Boolean);
    }
    const service=await call(`spring_boot_${action}`,args);mergeService(service);if(action==='start')connectEvents(p.dir);notice({start:'启动请求已提交。',stop:'服务已停止。',restart:'重启请求已提交。'}[action],true);
  }catch(e){notice(e.code==='BUILD_REQUIRED'?`${e.message}。完成构建后再点击启动。`:e.message);}finally{busy=false;renderService();}
}
$('add-form').addEventListener('submit',addProject);$('focus-add').addEventListener('click',()=>{$('add-panel').open=true;$('project-dir').focus();});
$('discover').addEventListener('click',async()=>{if(busy)return;busy=true;try{const data=await call('spring_boot_discover',{root:$('project-dir').value.trim()});for(const p of data.projects)projects.set(p.projectKey,{...projects.get(p.projectKey),...p});renderProjects();notice(`发现 ${data.projects.length} 个应用模块${data.truncated?'；扫描达到上限，请缩小目录范围':''}。`,!data.truncated);if(!selected&&data.projects.length)await selectProject(data.projects[0].projectKey);}catch(e){notice(e.message);}finally{busy=false;renderService();}});
$('refresh').addEventListener('click',async()=>{try{for(const service of await call('spring_boot_status'))mergeService(service);notice('共享状态已刷新。',true);}catch(e){notice(e.message);}});
for(const action of ['start','stop','restart'])$(action).addEventListener('click',()=>operate(action));
$('pause').addEventListener('click',()=>{state=reduceEvent(state,{type:state.paused?'resume':'pause'});renderLogs();});$('search').addEventListener('input',renderLogs);$('follow').addEventListener('change',renderLogs);
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(state.displayText);notice('当前日志已复制。',true);}catch{notice('浏览器未允许复制，请选中日志文本后手动复制。');}});
$('mode').addEventListener('change',()=>{$('config-summary').textContent={auto:'自动选择产物',jar:'使用可执行 jar',classpath:'使用完整 classpath'}[$('mode').value];});
window.addEventListener('pagehide',()=>stream?.close());
async function init(){
  try{
    const ticket=new URLSearchParams(location.hash.slice(1)).get('ticket');if(location.hash)history.replaceState(null,'',location.pathname);
    if(ticket){const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket})});const result=await response.json();if(!result.ok)throw new Error(result.error.message);}
    const services=await call('spring_boot_status');for(const service of services)mergeService(service);connected(true,'本机后台已连接');if(services.length)await selectProject(services[0].projectKey);else connectEvents();
  }catch(e){connected(false,'未连接');notice(`${e.message}。请从 Codex、Claude Code 或本地命令重新打开面板。`);}
}
void init();
