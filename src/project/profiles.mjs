import path from 'node:path';
import {readdir} from 'node:fs/promises';
import {parseAllDocuments} from 'yaml';
import {exists,readSmall} from './paths.mjs';

const namePattern=/^[\w.-]+$/;
const relevant=key=>/^spring\.(?:profiles(?:\.|\[|$)|config\.(?:activate\.|import|location|additional-location))/.test(key);
const names=value=>String(value??'').split(',').map(s=>s.trim()).filter(s=>namePattern.test(s));
function flatten(value,prefix='',result=new Map(),depth=0){
  if(depth>12||result.size>2000)throw new Error('配置层级或字段过多');
  if(value instanceof Map)for(const [key,item] of value)flatten(item,prefix?`${prefix}.${key}`:String(key),result,depth+1);
  else if(Array.isArray(value))value.forEach((item,index)=>flatten(item,`${prefix}[${index}]`,result,depth+1));
  else if(relevant(prefix))result.set(prefix,String(value??''));
  return result;
}
function properties(text){
  const result=new Map();let continued='';
  for(const raw of text.split(/\r?\n/)){
    const line=continued+raw.trimStart();
    if((line.match(/\\+$/)?.[0].length||0)%2){continued=line.slice(0,-1);continue;}continued='';
    if(/^[#!]/.test(line))continue;
    const pair=line.match(/^([^\s=:]+)\s*(?:[=:]\s*|\s+)(.*)$/);if(!pair||!relevant(pair[1]))continue;
    result.set(pair[1],pair[2].replace(/\\u([\da-f]{4})|\\(.)/gi,(_,hex,ch)=>hex?String.fromCharCode(parseInt(hex,16)):({t:'\t',n:'\n',r:'\r',f:'\f'}[ch]||ch)).trim());
  }
  return result;
}
function list(map,key){return map.get(key)??[...map].filter(([k])=>k.startsWith(key+'[')).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([,v])=>v).join(',');}

// 仅返回 Profile 元数据，不暴露配置原文、密码或其他环境变量，不加载外部配置。
export async function inspectSpringProfiles(dir,{env=process.env}={}){
  const roots=['target/classes','target/classes/config','src/main/resources','src/main/resources/config','.','config'];
  const extra=await readdir(path.join(dir,'config'),{withFileTypes:true}).catch(()=>[]);
  for(const entry of extra.sort((a,b)=>a.name.localeCompare(b.name)))if(entry.isDirectory()&&!entry.isSymbolicLink())roots.push(path.join('config',entry.name));
  const found=new Set(),base=new Map(),sources=new Map(),warnings=[];let count=0,total=0;
  for(const root of roots){
    const files=await readdir(path.join(dir,root),{withFileTypes:true}).catch(()=>[]);
    for(const file of files.sort((a,b)=>Number(a.name.endsWith('.properties'))-Number(b.name.endsWith('.properties'))||a.name.localeCompare(b.name))){
      const match=file.name.match(/^application(?:-(.+))?\.(yaml|yml|properties)$/);if(!match||!file.isFile())continue;
      if(++count>100){warnings.push('配置文件超过扫描上限，部分 Profile 未枚举');break;}
      const relative=path.join(root,file.name),location=path.join(dir,relative),size=(await exists(location))?.size||0;
      total+=size;if(size>131072||total>1048576){warnings.push(`配置文件过大，跳过 ${relative}`);continue;}
      if(match[1]&&namePattern.test(match[1]))found.add(match[1]);
      try{
        const content=await readSmall(location,131072);
        const documents=match[2]==='properties'?content.split(/^[#!]---\s*$/m).map(properties):parseAllDocuments(content,{schema:'failsafe',strict:true}).map(doc=>{if(doc.errors.length)throw new Error('无效 YAML');return flatten(doc.toJS({mapAsMap:true,maxAliasCount:20}));});
        for(const document of documents){
          const condition=document.get('spring.config.activate.on-profile')||document.get('spring.profiles');
          for(const key of ['spring.profiles.active','spring.profiles.default','spring.profiles.include'])for(const value of names(list(document,key)))found.add(value);
          for(const [key,value] of document){const group=key.match(/^spring\.profiles\.group\.([^.[\]]+)/)?.[1];if(group&&namePattern.test(group)){found.add(group);for(const member of names(value))found.add(member);}}
          if(condition)for(const token of condition.match(/[\w.-]+/g)||[])if(namePattern.test(token))found.add(token);
          // 受 Profile 或云平台条件控制的文档不能作为无条件默认值。
          if(match[1]||condition||document.has('spring.config.activate.on-cloud-platform'))continue;
          for(const field of ['spring.profiles.active','spring.profiles.default','spring.profiles.include'])if([...document.keys()].some(key=>key===field||key.startsWith(field+'[')))for(const key of [...base.keys()])if(key===field||key.startsWith(field+'[')){base.delete(key);sources.delete(key);}
          for(const [key,value] of document){base.set(key,value);sources.set(key,relative);}
        }
      }catch{warnings.push(`无法解析 ${relative} 的 Profile，请检查配置格式`);}
    }
    if(count>100)break;
  }
  const variable=key=>Object.entries(env).find(([name])=>name.toUpperCase()===key.toUpperCase())?.[1];
  const expand=raw=>{
    let result=String(raw||'');
    for(let i=0;i<8&&result.includes('${');i++){
      const next=result.replace(/\$\{([^{}]+)\}/g,(all,expression)=>{const colon=expression.indexOf(':'),key=colon<0?expression:expression.slice(0,colon),fallback=colon<0?undefined:expression.slice(colon+1);return variable(key)??base.get(key)??fallback??all;});
      if(next===result)break;result=next;
    }
    return result;
  };
  let raw=variable('SPRING_PROFILES_ACTIVE')??list(base,'spring.profiles.active');
  let source=variable('SPRING_PROFILES_ACTIVE')!==undefined?'SPRING_PROFILES_ACTIVE':sources.get('spring.profiles.active')||sources.get('spring.profiles.active[0]')||null;
  if(!raw){raw=variable('SPRING_PROFILES_DEFAULT')??list(base,'spring.profiles.default');source=variable('SPRING_PROFILES_DEFAULT')!==undefined?'SPRING_PROFILES_DEFAULT':sources.get('spring.profiles.default')||sources.get('spring.profiles.default[0]')||null;}
  const resolved=expand(raw),active=names(resolved),unresolved=!!raw&&(!active.length||active.join(',')!==resolved.split(',').map(v=>v.trim()).join(','));
  if(unresolved)warnings.push('默认 Profile 含未解析占位符或表达式，启动时继续使用应用配置');
  for(const value of active)found.add(value);
  if([...base.keys()].some(key=>/^spring\.config\.(?:import|location|additional-location)$/.test(key))||['SPRING_CONFIG_NAME','SPRING_CONFIG_LOCATION','SPRING_CONFIG_ADDITIONAL_LOCATION','SPRING_APPLICATION_JSON'].some(key=>variable(key)))warnings.push('项目引用外部配置，Profile 列表仅覆盖已扫描的本地 application 配置');
  return {profiles:[...found].sort(),activeProfile:unresolved?null:active.join(',')||null,profileSource:source,profileUnresolved:unresolved,warnings};
}
