// 本地浏览器验收专用：隔离工程 + Node 模拟输出，不执行 Java、Maven 或业务代码。
import {randomBytes} from 'node:crypto';
import {writeFile, mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture} from './project-fixtures.mjs';
import {normalizeProjectDir} from '../../src/project/paths.mjs';
import {createServiceManager} from '../../src/services/manager.mjs';
import {createLogStore} from '../../src/logs/log-store.mjs';
import {createAuth} from '../../src/backend/auth.mjs';
import {startBackend} from '../../src/backend/server.mjs';
import {createWorkspaceStore} from '../../src/backend/workspace.mjs';
import {atomicState} from '../../src/runtime/instance.mjs';
import {inspectProject} from '../../src/project/inspect.mjs';
import {scanJdks} from '../../src/project/jdk.mjs';
import {prepareLaunch} from '../../src/project/launch-plan.mjs';
import {mavenPreparation} from '../../src/project/build-instructions.mjs';
import {createJavaExecutor} from '../../src/services/executor.mjs';
import {spawn} from 'node:child_process';

const mockPicker = process.argv.includes('--mock-picker');
const importFeedback = process.argv.includes('--import-feedback');
let importAttempt = 0;
const interactions = process.argv.includes('--interactions');
const serviceRows = process.argv.includes('--service-rows');
const runtimeOptions = process.argv.includes('--runtime-options');
const compatibility = process.argv.includes('--compatibility');
const previewRoot = fileURLToPath(new URL(compatibility ? '../../.superpowers/panel-dsh-compatibility/' : runtimeOptions ? '../../.superpowers/panel-runtime-options/' : serviceRows ? '../../.superpowers/panel-service-rows/' : mockPicker ? '../../.superpowers/panel-interactions-mock/' : interactions ? '../../.superpowers/panel-interactions/' : '../../.superpowers/panel-preview/', import.meta.url));
await mkdir(previewRoot, {recursive: true});
const empty = process.argv.includes('--empty');
const sessionPath = path.join(previewRoot, empty ? 'empty.json' : 'services.json');
const demoPath = path.join(previewRoot, 'demo-output.mjs');
await writeFile(demoPath, `
const name = process.argv[2];
const stamp = () => new Date().toISOString().slice(11, 23);
const log = (level, text) => console.log(stamp() + '  ' + level.padEnd(5) + ' ' + text);
log('INFO', '[演示数据] Node 模拟服务输出，用于界面验收。');
console.log('\\x1b[32m[演示] ANSI 绿色\\x1b[0m / \\x1b[38;5;208m256 色橙色\\x1b[0m / \\x1b[38;2;160;190;255mRGB 蓝色\\x1b[0m'.replaceAll('\\x1b', String.fromCharCode(27)));
log('INFO', 'Starting ' + name + ' using Java 17（模拟）');
log('INFO', 'The following profile is active: local（模拟）');
log('INFO', 'Scanning application modules...');
log('INFO', 'Repository initialization completed in 48 ms（模拟）');
log('INFO', 'Initializing embedded application context');
log('INFO', 'Application context initialized（模拟）');
log('INFO', 'Mapped GET /api/orders and GET /actuator/health（模拟）');
log('WARN', '[演示] 未配置外部消息队列，使用本地模拟连接。');
log('INFO', 'Started DemoApplication in 1.284 seconds（模拟）');
log('INFO', '<b>HTML 输出保持原文，不执行标签</b>');
log('INFO', '[演示] 同一行命中：订单 / 订单 / 订单；检索时保留上下文。');
let tick = 0;
setInterval(() => {
  tick++;
  log('INFO', '[演示] GET /api/orders 200，耗时 ' + (12 + tick % 7) + ' ms');
  if (tick % 4 === 0) log('DEBUG', '[演示] 连接池检查完成，空闲连接 8。');
  if (tick % 7 === 0) console.error(stamp() + '  WARN  [演示] 请求接近超时阈值，已返回缓存结果。');
}, 2000);
`);
const fixtures = [];
for (const name of ['orders-api', 'inventory-worker', 'auth-service']) {
  const item = await fixture(compatibility && name === 'auth-service' ? 'missing' : 'fat-jar', {dirName: name});
  if (runtimeOptions) {
    await mkdir(path.join(item.dir,'src/main/resources'),{recursive:true});
    await writeFile(path.join(item.dir,'src/main/resources/application.yml'),'spring:\n  profiles:\n    active: local\n');
    for (const profile of ['local','dev','prod']) await writeFile(path.join(item.dir,`src/main/resources/application-${profile}.properties`),'# 模拟项目的配置文件，不连接外部服务\n');
    await writeFile(path.join(item.dir,'.java-version'),'17');
  }
  fixtures.push({...item, name});
}
const prepared=new Set();
const manager = createServiceManager({
  logs: createLogStore(),
  ...(compatibility?{
    prepareBuild:request=>mavenPreparation(request.dir,request),
    executor:{...createJavaExecutor(),spawnBuild(plan){
      const child=spawn(process.execPath,['-e',"console.log('[模拟 Maven] 编译当前模块及声明依赖；不执行真实 Maven');setTimeout(()=>console.log('[模拟 Maven] 正在准备运行依赖'),4000);setTimeout(()=>{console.log('[模拟 Maven] BUILD SUCCESS');process.exit(0);},12000);"],{cwd:plan.dir,windowsHide:true,stdio:['ignore','pipe','pipe']});
      child.once('close',code=>{if(code===0)prepared.add(plan.dir);});return child;
    }}
  }:{}),
  prepareLaunch: async request => {
    if(compatibility && path.basename(request.dir)==='auth-service'&&!prepared.has(request.dir))return prepareLaunch(request,{resolveJdk:async()=>({home:'模拟 JDK，不执行',executable:process.execPath})});
    const info=runtimeOptions?await inspectProject(request.dir):null;
    const runtime=runtimeOptions?await scanJdks({projectDir:request.dir,requiredJavaMajor:info.requiredJavaMajor||8}):null;
    return ({
    ...await normalizeProjectDir(request.dir), executable: process.execPath,
    args: [demoPath, path.basename(request.dir)], port: null,
    mode: request.mode === 'jar' ? 'jar' : 'classpath', profile: request.profile || info?.activeProfile || null,
    profileSource: request.profile ? 'explicit' : info?.profileSource || null,jdkHome:request.jdkHome || runtime?.recommendedJdkHome || null
  });},
  probePort: async () => false
});
if (!empty) {
  for (const item of fixtures) if(!compatibility||item.name!=='auth-service')await manager.start({dir: item.dir, ...(runtimeOptions ? {} : {profile: 'local'})});
  if(!compatibility)await manager.stop(fixtures[2].dir);
}
const token = randomBytes(32).toString('hex');
const auth = createAuth({token});
const workspace = createWorkspaceStore({persist: data => atomicState(path.join(previewRoot, 'workspace.json'), data)});
if(compatibility)await workspace.importProjects(await Promise.all(fixtures.map(item=>inspectProject(item.dir))));
const backend = await startBackend({
  manager, auth, workspace, instanceId: `panel-preview-${process.pid}`,
  ...(mockPicker ? {pickDirectory: async () => fixtures[0].dir} : {}),
  // 刻意延迟并覆盖成功、取消和失败，供浏览器核对等待反馈；不打开系统窗口。
  ...(importFeedback ? {
    pickDirectory: async () => {
      const attempt = ++importAttempt;
      await new Promise(resolve => setTimeout(resolve, 6000));
      if (attempt === 2) return null;
      if (attempt === 3) throw new Error('模拟目录选择失败');
      return fixtures[0].dir;
    },
    inspect: async dir => { await new Promise(resolve => setTimeout(resolve, 6000)); return inspectProject(dir); }
  } : {}),
  ...(compatibility ? {
    pickDirectory:async()=>{await new Promise(resolve=>setTimeout(resolve,6000));return fixtures[0].root;},
    inspect:async dir=>{if(dir===fixtures[0].root)await new Promise(resolve=>setTimeout(resolve,7000));return inspectProject(dir);}
  } : {}),
  onShutdown: async () => {
    for (const item of fixtures) await item.cleanup();
    await rm(sessionPath, {force: true});
  }
});
const url = `${backend.origin}/#ticket=${auth.issueTicket()}`;
await writeFile(sessionPath, JSON.stringify({origin: backend.origin, token, pid: process.pid, dirs: fixtures.map(item => item.dir)}));
console.log(JSON.stringify({url, sessionPath, dirs: fixtures.map(item => item.dir)}));
