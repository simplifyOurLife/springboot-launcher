import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {discoverProjects} from '../project/discover.mjs';
import {inspectProject} from '../project/inspect.mjs';
import {ok,failure,fail} from '../core/errors.mjs';
import {validateTool} from '../core/contracts.mjs';
import {readJson} from './body.mjs';
import {createEventStream} from './events.mjs';
import {createWorkspaceStore} from './workspace.mjs';
import {pickProjectDirectory} from './folder-picker.mjs';
import {scanJdks as defaultScanJdks} from '../project/jdk.mjs';
import {createAppUpdates} from '../runtime/updates.mjs';
export async function startBackend({manager,auth,instanceId,webDir=fileURLToPath(new URL('../../web/',import.meta.url)),onShutdown=async()=>{},discover=discoverProjects,inspect=inspectProject,scanJdks=defaultScanJdks,workspace=createWorkspaceStore(),pickDirectory=pickProjectDirectory,appUpdates=createAppUpdates()}){
  let origin,closed=false,pickerPending=false;const streams=new Set();
  // 升级后校正旧版误导入的基础模块；检查失败及仍被托管的服务必须保留。
  const protectedKeys=new Set((await manager.list()).filter(item=>['starting','running','stopping','orphaned'].includes(item.status)).map(item=>item.projectKey));
  const removeKeys=[];
  for(const project of workspace.snapshot().projects){
    if(protectedKeys.has(project.projectKey))continue;
    try{if((await inspect(project.dir)).matched===false)removeKeys.push(project.projectKey);}catch{/* 无法访问不代表不是应用。 */}
  }
  if(removeKeys.length)await workspace.importProjects([],null,{removeKeys});
  // 页面与后台必须属于同一次启动，避免更新源码后旧接口接收到新参数。
  const staticFiles={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.mjs':'app.mjs','/state.mjs':'state.mjs','/presentation.mjs':'presentation.mjs','/i18n.mjs':'i18n.mjs','/messages.mjs':'messages.mjs','/sidebar-resize.mjs':'sidebar-resize.mjs','/select-field.mjs':'select-field.mjs','/toast.mjs':'toast.mjs','/app-updates.mjs':'app-updates.mjs'};
  const staticContent=new Map(await Promise.all([...new Set(Object.values(staticFiles))].map(async filename=>[filename,await readFile(path.join(webDir,filename)).catch(()=>null)])));
  const dashboard=()=>({url:`${origin}/#ticket=${auth.issueTicket()}`});
  const publishWorkspace=data=>{for(const stream of streams)stream.send('workspace',data);return data;};
  const json=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    try{
      if(req.headers.host!==new URL(origin).host)fail('FORBIDDEN','请求 Host 不匹配本机后台');
      if(req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']&& !['same-origin','none'].includes(req.headers['sec-fetch-site']))fail('FORBIDDEN','只允许本机同源请求');
      const url=new URL(req.url,origin),route=url.pathname;
      if(req.method==='GET'&&staticFiles[route]){
        const filename=staticFiles[route],type=filename.endsWith('.html')?'text/html':filename.endsWith('.css')?'text/css':'text/javascript';
        try{const content=staticContent.get(filename);if(!content)throw new Error('页面文件不存在');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-store'});res.end(content);}catch{json(res,404,failure({}));}return;
      }
      if(route==='/api/session'&&req.method==='POST'){
        if(req.headers.origin!==origin)fail('FORBIDDEN','票据兑换需要同源请求');
        const body=await readJson(req);if(Object.keys(body).some(k=>k!=='ticket'))fail('INVALID_ARGUMENT','票据参数无效');
        const session=auth.exchangeTicket(body.ticket);json(res,200,ok({authenticated:true}),{'Set-Cookie':`${auth.cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`});return;
      }
      const identity=auth.authenticate(req);if(!identity)fail('UNAUTHORIZED','需要有效的本机凭据或面板会话');
      if(identity==='session'&&req.headers.origin!==origin&&req.headers['sec-fetch-site']!=='same-origin')fail('FORBIDDEN','面板操作需要同源请求');
      if(route==='/api/health'&&req.method==='GET'){json(res,200,ok({instanceId}));return;}
      if(route==='/api/app/info'&&req.method==='GET'){json(res,200,ok(await appUpdates.info()));return;}
      if(route==='/api/app/check-update'&&req.method==='POST'){
        const body=await readJson(req);if(Object.keys(body).some(key=>key!=='force')||body.force!==undefined&&typeof body.force!=='boolean')fail('INVALID_ARGUMENT','更新检查参数无效');
        json(res,200,ok(await appUpdates.check(body)));return;
      }
      if(route==='/api/app/open-installer'&&req.method==='POST'){
        const body=await readJson(req);if(Object.keys(body).length)fail('INVALID_ARGUMENT','安装向导不接受自定义参数');
        json(res,200,ok(await appUpdates.openInstaller()));return;
      }
      if(route==='/api/app/create-shortcut'&&req.method==='POST'){
        const body=await readJson(req);if(Object.keys(body).length)fail('INVALID_ARGUMENT','桌面入口不接受自定义参数');
        json(res,200,ok(await appUpdates.createShortcut()));return;
      }
      if(route==='/api/ticket'&&req.method==='POST'){if(identity!=='bearer')fail('FORBIDDEN','访问票据只能由本地客户端申请');await readJson(req);json(res,200,ok(dashboard()));return;}
      if(route==='/api/workspace'&&req.method==='GET'){json(res,200,ok(workspace.snapshot()));return;}
      if(route==='/api/workspace/command'&&req.method==='POST'){
        const command=await readJson(req);let data;
        if(command.type==='project.remove'){
          if(Object.keys(command).some(key=>!['type','projectKey'].includes(key)))fail('INVALID_ARGUMENT','工作区操作参数无效');
          const imported=workspace.snapshot().projects.find(item=>item.projectKey===command.projectKey);
          const project=imported||(await manager.list()).find(item=>item.projectKey===command.projectKey);
          if(!project)fail('INVALID_ARGUMENT','项目不存在，请刷新工作区');
          data=await manager.removeProject(project.dir,()=>imported?workspace.command(command):workspace.snapshot());
          for(const stream of streams)stream.send('project-removed',{projectKey:command.projectKey});
          json(res,200,ok(publishWorkspace(data)));return;
        }
        if(command.type==='project.move'&&(!Object.hasOwn(command,'folderId')||(command.folderId!==null&&typeof command.folderId!=='string')))fail('INVALID_ARGUMENT','目标文件夹参数无效');
        if(command.type==='project.move'&&!workspace.snapshot().projects.some(project=>project.projectKey===command.projectKey)){
          if(Object.keys(command).some(key=>!['type','projectKey','folderId','beforeProjectKey'].includes(key)))fail('INVALID_ARGUMENT','工作区操作参数无效');
          const service=(await manager.list()).find(item=>item.projectKey===command.projectKey);
          if(!service)fail('INVALID_ARGUMENT','项目不存在，请刷新工作区');
          data=await workspace.command(command,{projectInfo:service});
        }else data=await workspace.command(command);
        json(res,200,ok(publishWorkspace(data)));return;
      }
      if(route==='/api/workspace/import'&&req.method==='POST'){
        const body=await readJson(req),folderId=body.folderId??null,requestId=body.requestId;
        if(Object.keys(body).some(key=>!['folderId','requestId'].includes(key))||(folderId!==null&&typeof folderId!=='string')||(requestId!==undefined&&(typeof requestId!=='string'||!/^[\w-]{1,64}$/.test(requestId))))fail('INVALID_ARGUMENT','项目导入参数无效');
        workspace.validateFolder(folderId);
        if(pickerPending)fail('PICKER_BUSY','已有目录选择窗口，请先完成或取消选择');
        pickerPending=true;
        const controller=new AbortController();
        const abortPicker=()=>{if(!res.writableEnded)controller.abort();};res.once('close',abortPicker);
        const progress=(phase,message)=>{if(requestId)for(const stream of streams)stream.send('import-progress',{requestId,phase,message});};
        try{
          progress('selecting','正在打开系统目录窗口，请选择项目目录…');
          const dir=await pickDirectory({signal:controller.signal});
          if(!dir){json(res,200,ok({cancelled:true}));return;}
          progress('scanning','已选择目录，正在识别 Spring Boot 服务…');
          let direct;try{direct=await inspect(dir);}catch{}
          let infos=[],warnings=[],truncated=false;
          if(direct?.matched)infos=[direct];
          else{
            const found=await discover(dir);warnings=found.warnings||[];truncated=!!found.truncated;
            if(found.projects.length>100)fail('INVALID_ARGUMENT','项目模块过多，请选择更小的目录范围');
            for(const [index,candidate] of found.projects.entries())try{progress('scanning',`正在检查应用模块 ${index+1} / ${found.projects.length}…`);const info=await inspect(candidate.dir);if(info.matched)infos.push(info);}catch{warnings.push(`跳过无法检查的模块：${candidate.name||path.basename(candidate.dir)}`);}
          }
          if(!infos.length)fail('NOT_BOOT_PROJECT','所选目录中没有可导入的 Maven Spring Boot 应用模块，请重新选择');
          const removeKeys=[],services=await manager.list();
          for(const saved of workspace.snapshot().projects){
            const relative=path.relative(dir,saved.dir);
            if(relative.startsWith('..')||path.isAbsolute(relative)||infos.some(info=>info.projectKey===saved.projectKey)||services.some(service=>service.projectKey===saved.projectKey&&['starting','running','stopping','orphaned'].includes(service.status)))continue;
            try{if((await inspect(saved.dir)).matched===false)removeKeys.push(saved.projectKey);}catch{/* 无法读取的工程保留记录，不能把检查失败当作基础模块。 */}
          }
          progress('saving',`已识别 ${infos.length} 个应用模块，正在保存导入结果…`);
          const data=publishWorkspace(await workspace.importProjects(infos,folderId,{removeKeys}));
          json(res,200,ok({cancelled:false,workspace:data,projects:infos,warnings,truncated}));
        }finally{pickerPending=false;res.off('close',abortPicker);}
        return;
      }
      if(route.startsWith('/api/tools/')&&req.method==='POST'){
        const name=route.slice('/api/tools/'.length),args=validateTool(name,await readJson(req));let data;
        switch(name){
          case 'spring_boot_discover':{const {root,...options}=args;data=await discover(root,options);break;}
          case 'spring_boot_inspect':{const info=await inspect(args.dir),runtime=await scanJdks({projectDir:info.dir,requiredJavaMajor:info.requiredJavaMajor||8});data={...info,...runtime,warnings:[...(info.warnings||[]),...(runtime.warnings||[])]};break;}
          case 'spring_boot_start':data=await manager.start(args);break;
          case 'spring_boot_status':data=await manager.status(args.dir);break;
          case 'spring_boot_logs':data=await manager.logs(args.dir,args);break;
          case 'spring_boot_stop':data=await manager.stop(args.dir);break;
          case 'spring_boot_restart':data=await manager.restart(args.dir);break;
          case 'spring_boot_dashboard':if(identity!=='bearer')fail('FORBIDDEN','请从本地客户端打开面板');data=dashboard();break;
        }json(res,200,ok(data));return;
      }
      if(route==='/api/events'&&req.method==='GET'){
        const dir=url.searchParams.get('dir'),queryAfter=Number(url.searchParams.get('after')||0),lastId=req.headers['last-event-id'];const after=lastId===undefined?queryAfter:Number(lastId);if(!Number.isSafeInteger(queryAfter)||queryAfter<0||!Number.isSafeInteger(after)||after<0)fail('INVALID_ARGUMENT','日志序号无效');
        const projectKey=dir?(await manager.status(dir)).projectKey:null;
        if(res.destroyed||res.writableEnded)return;
        // 先建立订阅，再同步加载快照；客户端用序号去重，避免快照期间丢事件。
        const pending=[];let priming=true,off,pendingBytes=0;
        const stream=createEventStream(res,{onClose:()=>{off?.();streams.delete(stream);}});streams.add(stream);
        off=manager.subscribe(event=>{if(event.type==='log'&&event.data.projectKey!==projectKey)return;if(priming){pendingBytes+=Buffer.byteLength(JSON.stringify(event));if(pending.length<2000&&pendingBytes<=524288)pending.push(event);else stream.close();}else stream.send(event.type,event.data,event.type==='log'?event.data.seq:undefined);});
        if(stream.closed){off();return;}
        stream.send('services',await manager.list());
        stream.send('workspace',workspace.snapshot());
        if(dir&&!stream.closed){const snapshot=await manager.logs(dir,{after,lines:1000,maxBytes:65536});stream.send('snapshot',snapshot,snapshot.lastSeq);}
        priming=false;for(const event of pending)stream.send(event.type,event.data,event.type==='log'?event.data.seq:undefined);return;
      }
      if(route==='/api/orphan/forget'&&req.method==='POST'){
        if(identity!=='bearer')fail('FORBIDDEN','遗忘记录需要本地命令确认');const body=await readJson(req);if(Object.keys(body).some(k=>!['dir','acknowledge'].includes(k)))fail('INVALID_ARGUMENT','遗忘参数无效');json(res,200,ok(await manager.confirmOrphan(body.dir,{acknowledge:body.acknowledge})));return;
      }
      if(route==='/api/shutdown'&&req.method==='POST'){
        if(identity!=='bearer')fail('FORBIDDEN','后台退出仅允许本地命令');const body=await readJson(req);if(Object.keys(body).some(k=>k!=='stopServices')||body.stopServices!==undefined&&typeof body.stopServices!=='boolean')fail('INVALID_ARGUMENT','退出参数无效');
        await manager.shutdown(body);json(res,200,ok({stopped:true}));res.once('finish',()=>{void onShutdown().then(close).catch(()=>{});});return;
      }
      json(res,404,{ok:false,error:{code:'NOT_FOUND',message:'接口不存在'}});
    }catch(error){if(res.headersSent){res.end();return;}const status={UNAUTHORIZED:401,FORBIDDEN:403,BODY_TOO_LARGE:413,REQUEST_TIMEOUT:408,INVALID_ARGUMENT:400}[error.code]||422;json(res,status,failure(error));}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
  async function close(){if(closed)return;closed=true;auth.invalidate();for(const stream of streams)stream.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
  return {origin,close};
}
