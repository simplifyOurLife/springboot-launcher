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
export async function startBackend({manager,auth,instanceId,webDir=fileURLToPath(new URL('../../web/',import.meta.url)),onShutdown=async()=>{},discover=discoverProjects,inspect=inspectProject}){
  let origin,closed=false;const streams=new Set();
  const dashboard=()=>({url:`${origin}/#ticket=${auth.issueTicket()}`});
  const json=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    try{
      if(req.headers.host!==new URL(origin).host)fail('FORBIDDEN','请求 Host 不匹配本机后台');
      if(req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']&& !['same-origin','none'].includes(req.headers['sec-fetch-site']))fail('FORBIDDEN','只允许本机同源请求');
      const url=new URL(req.url,origin),route=url.pathname;
      const staticFiles={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.mjs':'app.mjs','/state.mjs':'state.mjs'};
      if(req.method==='GET'&&staticFiles[route]){
        const filename=staticFiles[route],type=filename.endsWith('.html')?'text/html':filename.endsWith('.css')?'text/css':'text/javascript';
        try{const content=await readFile(path.join(webDir,filename));res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-store'});res.end(content);}catch{json(res,404,failure({}));}return;
      }
      if(route==='/api/session'&&req.method==='POST'){
        if(req.headers.origin!==origin)fail('FORBIDDEN','票据兑换需要同源请求');
        const body=await readJson(req);if(Object.keys(body).some(k=>k!=='ticket'))fail('INVALID_ARGUMENT','票据参数无效');
        const session=auth.exchangeTicket(body.ticket);json(res,200,ok({authenticated:true}),{'Set-Cookie':`launcher_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`});return;
      }
      const identity=auth.authenticate(req);if(!identity)fail('UNAUTHORIZED','需要有效的本机凭据或面板会话');
      if(identity==='session'&&req.headers.origin!==origin&&req.headers['sec-fetch-site']!=='same-origin')fail('FORBIDDEN','面板操作需要同源请求');
      if(route==='/api/health'&&req.method==='GET'){json(res,200,ok({instanceId}));return;}
      if(route==='/api/ticket'&&req.method==='POST'){if(identity!=='bearer')fail('FORBIDDEN','访问票据只能由本地客户端申请');await readJson(req);json(res,200,ok(dashboard()));return;}
      if(route.startsWith('/api/tools/')&&req.method==='POST'){
        const name=route.slice('/api/tools/'.length),args=validateTool(name,await readJson(req));let data;
        switch(name){
          case 'spring_boot_discover':{const {root,...options}=args;data=await discover(root,options);break;}
          case 'spring_boot_inspect':data=await inspect(args.dir);break;
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
