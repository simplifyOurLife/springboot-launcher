import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fixture} from './helpers/project-fixtures.mjs';
import {createServiceManager} from '../src/services/manager.mjs';
import {createLogStore} from '../src/logs/log-store.mjs';
for(const missing of [true,false])test(missing?'缺类退出只准备并重试一次':'业务错误不自动重建',async t=>{
 const f=await fixture();let launches=0,builds=0;
 const manager=createServiceManager({logs:createLogStore(),probePort:async()=>false,
 prepareLaunch:async()=>({dir:f.dir,mode:'classpath'}),prepareBuild:async()=>({dir:f.dir,offline:true}),
 executor:{spawn(){launches++;return spawn(process.execPath,['-e',`console.error('${missing?'java.lang.NoClassDefFoundError: demo/Missing':'Database connection refused'}');process.exit(1)`],{windowsHide:true});},spawnBuild(){builds++;return spawn(process.execPath,['-e','process.exit(0)'],{windowsHide:true});}}});
 t.after(async()=>{await manager.shutdown({stopServices:true});await f.cleanup();});
 await manager.start({dir:f.dir});const deadline=Date.now()+5000;
 while((await manager.status(f.dir)).phase&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
 assert.equal((await manager.status(f.dir)).status,'failed');assert.equal(builds,missing?1:0);assert.equal(launches,missing?2:1);
});
test('离线缓存缺失自动联网一次，不要求面板传递参数',async t=>{
 const f=await fixture();let builds=0;const networks=[];
 const manager=createServiceManager({logs:createLogStore(),probePort:async()=>false,
 prepareLaunch:async()=>{if(builds<2){const e=new Error('缺少产物');e.code='BUILD_REQUIRED';throw e;}return {dir:f.dir,mode:'classpath'};},
 prepareBuild:async request=>{networks.push(request.mvnOffline);return {offline:request.mvnOffline!==false};},
 executor:{spawnBuild(){builds++;return spawn(process.execPath,['-e',builds===1?"console.error('Cannot access repository in offline mode');process.exit(1)":"process.exit(0)"],{windowsHide:true});},spawn(){return spawn(process.execPath,['-e','process.exit(0)'],{windowsHide:true});}}});
 t.after(async()=>{await manager.shutdown({stopServices:true});await f.cleanup();});await manager.start({dir:f.dir});
 const deadline=Date.now()+5000;while((await manager.status(f.dir)).phase&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
 assert.equal((await manager.status(f.dir)).status,'exited');assert.deepEqual(networks,[undefined,false]);assert.equal(builds,2);
});
