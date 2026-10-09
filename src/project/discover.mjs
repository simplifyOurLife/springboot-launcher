import path from 'node:path';
import {readdir} from 'node:fs/promises';
import {normalizeProjectDir,exists} from './paths.mjs';
import {readPom} from './pom.mjs';
import {validateTool} from '../core/contracts.mjs';
export async function discoverProjects(root,options={}) {
  validateTool('spring_boot_discover',{root,...options});
  const normalized=await normalizeProjectDir(root), projects=[],warnings=[];
  const queue=[[normalized.dir,0]],deadline=Date.now()+(options.timeoutMs??5000);let count=0,truncated=false;
  while(queue.length){
    if(count++>=(options.maxDirs??2000)||Date.now()>deadline){truncated=true;break;}
    const [dir,depth]=queue.shift();
    if(await exists(path.join(dir,'pom.xml')))try{const pom=await readPom(dir);if(pom.packaging!=='pom')projects.push({...await normalizeProjectDir(dir),name:pom.artifactId||path.basename(dir)});}catch{warnings.push(`跳过无法解析的 Maven 模块：${path.basename(dir)}`);}
    if(depth>=(options.depth??6))continue;
    for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[]))if(entry.isDirectory()&&!entry.isSymbolicLink()&&!['.git','node_modules','target','logs'].includes(entry.name))queue.push([path.join(dir,entry.name),depth+1]);
  }
  return {projects,truncated,warnings};
}
