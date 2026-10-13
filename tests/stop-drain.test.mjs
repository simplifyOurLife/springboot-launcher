import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createJavaExecutor} from '../src/services/executor.mjs';
import {createServiceManager} from '../src/services/manager.mjs';
import {createLogStore} from '../src/logs/log-store.mjs';
import {fixture} from './helpers/project-fixtures.mjs';
for(const graceful of [true,false])test(graceful?'非强制停止等待退出，不执行强杀':'非强制停止超时后才强杀',{skip:process.platform!=='win32'},async()=>{
 const child=new EventEmitter();Object.assign(child,{pid:12345,exitCode:null,signalCode:null});const calls=[];
 const executor=createJavaExecutor({gracePeriodMs:25,spawn(exe,args){calls.push(args);const killer=new EventEmitter();setImmediate(()=>{killer.emit('close',0);if(graceful||args.includes('/F'))setTimeout(()=>{child.exitCode=0;child.emit('close',0);},5);});return killer;}});
 assert.equal(await executor.stop(child),true);assert.equal(calls.length,graceful?1:2);assert.equal(calls[0].includes('/F'),false);if(!graceful)assert.equal(calls[1].includes('/F'),true);
});
test('停止期间持续收到日志，close 后才结束日志',async t=>{
 const f=await fixture();const child=new EventEmitter();Object.assign(child,{pid:12345,stdout:new PassThrough(),stderr:new PassThrough()});
 const manager=createServiceManager({logs:createLogStore(),probePort:async()=>false,prepareLaunch:async()=>({mode:'classpath'}),executor:{spawn(){setImmediate(()=>child.emit('spawn'));return child;},async stop(){child.stdout.write('正在关闭连接池\n');setTimeout(()=>{child.stderr.write('连接池关闭完成\n');child.stdout.end();child.stderr.end();child.emit('close',0);},30);return true;}}});
 t.after(async()=>{await manager.shutdown({stopServices:true});await f.cleanup();});await manager.start({dir:f.dir});
 const stopping=manager.stop(f.dir);await new Promise(r=>setTimeout(r,10));assert.equal((await manager.status(f.dir)).status,'stopping');assert.match((await manager.logs(f.dir)).text,/正在关闭连接池/);
 await stopping;assert.equal((await manager.status(f.dir)).status,'stopped');assert.match((await manager.logs(f.dir)).text,/连接池关闭完成/);
});
