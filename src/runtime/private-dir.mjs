import {mkdir,readFile,writeFile,readdir,lstat,chmod} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {fail,LauncherError} from '../core/errors.mjs';
const exec=promisify(execFile);
export async function preparePrivateHome(input){
  if(!path.isAbsolute(input))fail('INVALID_ARGUMENT','后台目录必须是绝对路径');const dir=path.resolve(input);await mkdir(dir,{recursive:true});
  if((await lstat(dir)).isSymbolicLink())fail('INVALID_ARGUMENT','后台目录不能是符号链接或联接');
  const marker=path.join(dir,'.launcher-owned');const owned=await readFile(marker,'utf8').catch(()=>null);
  if(owned!=='springboot-launcher/v1'){
    if((await readdir(dir)).length)fail('INVALID_ARGUMENT','不能将已有非空目录改为启动器私有目录，请指定空目录');
    await writeFile(marker,'springboot-launcher/v1',{flag:'wx',mode:0o600}).catch(async error=>{if(error.code!=='EEXIST'||await readFile(marker,'utf8')!=='springboot-launcher/v1')throw error;});
  }
  try{
    if(process.platform==='win32'){
      const shell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
      // Windows PowerShell 重建自己的模块路径，避免加载 PowerShell 7 的不兼容模块。
      const helperEnv={...process.env};for(const key of Object.keys(helperEnv))if(key.toLowerCase()==='psmodulepath')delete helperEnv[key];
      await exec(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../../scripts/private-dir.ps1',import.meta.url)),'-Directory',dir],{env:helperEnv,windowsHide:true,shell:false,timeout:8000,maxBuffer:16384});
    }else await chmod(dir,0o700);
  }catch(error){const problem=new LauncherError('PRIVATE_DIRECTORY_FAILED','无法确认私有目录权限，后台尚未启动');problem.cause=error;throw problem;}
  return dir;
}
