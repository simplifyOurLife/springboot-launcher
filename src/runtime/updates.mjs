import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {APP_VERSION} from '../core/version.mjs';
import {fail} from '../core/errors.mjs';

const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
const repository='https://github.com/simplifyOurLife/springboot-launcher';
const shell=()=>path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
export function compareVersions(a,b){
  const parse=value=>{if(!/^\d+\.\d+\.\d+$/.test(value))throw new Error('版本号无效');return value.split('.').map(Number);};
  const left=parse(a),right=parse(b);for(let i=0;i<3;i++)if(left[i]!==right[i])return Math.sign(left[i]-right[i]);return 0;
}
export function releaseInfo(release,currentVersion=APP_VERSION){
  const version=String(release?.tag_name||'').replace(/^v/,'');
  if(release?.draft||release?.prerelease||!/^\d+\.\d+\.\d+$/.test(version))throw new Error('发行版本无效');
  if(release.html_url!==`${repository}/releases/tag/v${version}`)throw new Error('发行来源无效');
  const filename=`springboot-launcher-v${version}-windows.zip`;
  const archive=release.assets?.find(asset=>asset.name===filename);
  const checksum=release.assets?.find(asset=>asset.name==='checksums.txt');
  const allowed=asset=>!!asset&&asset.browser_download_url===`${repository}/releases/download/v${version}/${asset.name}`;
  return {currentVersion,latestVersion:version,available:compareVersions(version,currentVersion)>0,releaseUrl:release.html_url,installable:!!(allowed(archive)&&allowed(checksum)),notes:typeof release.body==='string'?release.body.slice(0,6000):'',state:'checked'};
}
async function readLatest(){
  if(process.platform==='win32'){
    const env={...process.env};for(const key of Object.keys(env))if(key.toLowerCase()==='psmodulepath')delete env[key];
    const {stdout}=await promisify(execFile)(shell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(sourceRoot,'scripts/release-metadata.ps1')],{env,windowsHide:true,timeout:15000,maxBuffer:300000});
    return JSON.parse(stdout.trim().replace(/^\uFEFF/,''));
  }
  const response=await fetch('https://api.github.com/repos/simplifyOurLife/springboot-launcher/releases/latest',{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});
  return {status:response.status,release:response.ok?await response.json():null};
}
export async function installedRoot(root=sourceRoot){
  const parent=path.resolve(root,'../..');
  try{
    const data=JSON.parse(await readFile(path.join(parent,'installation.json'),'utf8'));
    if(data.product==='springboot-launcher'&&/^\d+\.\d+\.\d+$/.test(data.version)&&path.resolve(parent,'versions',data.version)===path.resolve(root))return parent;
  }catch{/* 源码目录不视为可原地覆盖的托管安装。 */}
  return null;
}
export function createAppUpdates({readRelease=readLatest,version=APP_VERSION,clock=Date.now,root=sourceRoot,launch=spawn}={}){
  let cached=null,cachedAt=0,pending=null;
  return {
    async info(){return {version,managed:!!await installedRoot(root),installerAvailable:process.platform==='win32'};},
    async check({force=false}={}){
      if(pending)return pending;
      if(!force&&cached&&clock()-cachedAt<(cached.state==='unavailable'?60000:1800000))return cached;
      pending=(async()=>{
        try{
          const result=await readRelease();
          if(result.status===404)return {currentVersion:version,state:'unpublished',available:false,installable:false};
          if(result.status!==200)throw new Error('无法读取发行信息');
          return releaseInfo(result.release,version);
        }catch{return {currentVersion:version,state:'unavailable',available:false,installable:false};}
      })();
      try{cached=await pending;cachedAt=clock();return cached;}finally{pending=null;}
    },
    async createShortcut(){
      if(process.platform!=='win32')fail('INVALID_ARGUMENT','快捷方式当前仅支持 Windows');
      const target=await installedRoot(root)||root;
      const env={...process.env};for(const key of Object.keys(env))if(key.toLowerCase()==='psmodulepath')delete env[key];
      await promisify(execFile)(shell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/create-shortcuts.ps1'),'-Root',target,'-DesktopOnly'],{env,windowsHide:true,timeout:15000,maxBuffer:16000});
      return {created:true};
    },
    async openInstaller(){
      if(process.platform!=='win32')fail('INVALID_ARGUMENT','安装向导当前仅支持 Windows');
      const installRoot=await installedRoot(root),args=['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/install.ps1')];
      if(installRoot)args.push('-InstallRoot',installRoot,'-Upgrade');
      // 固定安装器自己弹出交互窗口；不接收网页提供的脚本、路径或命令。
      const env={...process.env};for(const key of Object.keys(env))if(key.toLowerCase()==='psmodulepath')delete env[key];
      await new Promise((resolve,reject)=>{const child=launch(shell(),args,{env,windowsHide:true,detached:true,stdio:'ignore'});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
      return {opened:true,managed:!!installRoot};
    }
  };
}
