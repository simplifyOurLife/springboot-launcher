#!/usr/bin/env node
import path from 'node:path';
import {APP_VERSION} from '../src/core/version.mjs';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {createMcpServer} from '../src/mcp/server.mjs';
import {ensureBackend} from '../src/runtime/instance.mjs';
import {createBackendClient} from '../src/runtime/client.mjs';
import {runDaemon} from '../src/runtime/daemon.mjs';
import {failure} from '../src/core/errors.mjs';
const help='Spring Boot 启动器 '+APP_VERSION+'\n用法：\n  mcp                              供 Codex / Claude Code 使用\n  dashboard [--no-open]             打开实时日志面板\n  status                           查看所有托管服务\n  daemon stop [--stop-services]     退出后台；默认拒绝仍有服务的退出\n  daemon forget --dir DIR --confirm-orphan  确认已人工处理后遗忘异常记录\n  --help                           显示帮助\n';
async function openLocalBrowser(url){
  if(process.platform!=='win32')return;
  const env={...process.env};for(const key of Object.keys(env))if(key.toLowerCase()==='psmodulepath')delete env[key];
  await promisify(execFile)(path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../scripts/open-browser.ps1',import.meta.url)),'-Url',url],{env,windowsHide:true,shell:false});
}
export async function runCli(argv,{connect=async()=>createBackendClient(await ensureBackend({timeoutMs:30000})),stdout=process.stdout,stderr=process.stderr,openBrowser=openLocalBrowser}={}){
  if(!argv.length||argv.length===1&&['--help','-h'].includes(argv[0])){stdout.write(help);return 0;}
  const [command,...args]=argv;
  const valid=command==='mcp'&&args.length===0||command==='status'&&args.length===0||command==='dashboard'&&(args.length===0||args.length===1&&args[0]==='--no-open')||command==='daemon'&&(args[0]==='stop'&&(args.length===1||args.length===2&&args[1]==='--stop-services')||args[0]==='forget'&&args.length===4&&args[1]==='--dir'&&args[3]==='--confirm-orphan')||command==='_daemon'&&args.length===4&&args[0]==='--home'&&args[2]==='--instance-id';
  if(!valid){stderr.write('参数无效，请查看 --help\n');return 2;}
  try{
    if(command==='_daemon'){await runDaemon({home:args[1],instanceId:args[3]});return 0;}
    const client=await connect();
    if(command==='mcp'){serveStdio(()=>createMcpServer({client}),{onerror:()=>stderr.write('MCP 连接异常\n')});return 0;}
    let result;
    if(command==='dashboard'){result=await client.dashboard();if(result.ok){stdout.write(result.data.url+'\n');if(!args.includes('--no-open'))await openBrowser(result.data.url);return 0;}}
    else if(command==='status')result=await client.invoke('spring_boot_status',{});
    else if(args[0]==='stop')result=await client.shutdown({stopServices:args.includes('--stop-services')});
    else result=await client.confirmOrphan(args[2],{acknowledge:true});
    (result.ok?stdout:stderr).write(JSON.stringify(result,null,2)+'\n');return result.ok?0:1;
  }catch(error){stderr.write(JSON.stringify(failure(error))+'\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await runCli(process.argv.slice(2));
