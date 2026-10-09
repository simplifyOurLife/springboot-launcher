import {stat,readdir,readFile} from 'node:fs/promises';
import {realpath as resolveRealpath} from 'node:fs';
import {promisify} from 'node:util';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fail} from '../core/errors.mjs';
import {text} from '../core/contracts.mjs';
// callback 实现与 Windows 受限令牌兼容，同时仍解析目录联接。
const realpath=promisify(resolveRealpath);
export async function normalizeProjectDir(input) {
  text(input,'项目目录');
  if(!path.isAbsolute(input))fail('INVALID_ARGUMENT','项目目录必须是绝对路径');
  let dir;
  try {dir=await realpath(input);if(!(await stat(dir)).isDirectory())throw new Error();}
  catch{fail('INVALID_ARGUMENT','项目目录不存在或不可读取');}
  const normalized=process.platform==='win32'?dir.toLowerCase():dir;
  return {dir,projectKey:createHash('sha256').update(normalized).digest('hex').slice(0,24)};
}
export async function exists(file) { try{return await stat(file);}catch{return null;} }
export async function readSmall(file,max=1048576) {
  const s=await exists(file);if(!s)return '';
  if(s.size>max)fail('UNSUPPORTED_PROJECT','项目元数据过大，请使用明确运行参数');
  return readFile(file,'utf8');
}
export async function walk(root,{depth=8,maxEntries=10000}={}) {
  const files=[];let count=0;
  async function visit(dir,level){
    for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[])){
      if(++count>maxEntries)fail('UNSUPPORTED_PROJECT','项目检查超过文件数量上限');
      if(entry.isSymbolicLink())continue;
      const name=path.join(dir,entry.name);
      if(entry.isFile())files.push(name);
      else if(entry.isDirectory()&&level<depth&&!['.git','node_modules'].includes(entry.name))await visit(name,level+1);
    }
  }
  if(await exists(root))await visit(root,0);return files;
}
