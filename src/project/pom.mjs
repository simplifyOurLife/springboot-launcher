import path from 'node:path';
import {readSmall,exists} from './paths.mjs';
import {fail} from '../core/errors.mjs';
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
export const tag=(xml,name)=>decode(xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1]?.trim()||'');
// 仅解析本地 Maven 常见结构，不展开实体、不执行插件或读取远端 parent。
export async function readPom(dir,seen=new Set()) {
  if(seen.size>8||seen.has(dir))fail('UNSUPPORTED_PROJECT','Maven parent 循环或层级过深');
  seen.add(dir);let xml=(await readSmall(path.join(dir,'pom.xml'))).replace(/<!--[\s\S]*?-->/g,'');
  if(!xml)fail('UNSUPPORTED_PROJECT','首版需要包含 pom.xml 的 Maven 应用模块');
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))fail('UNSUPPORTED_PROJECT','不支持包含实体声明的 POM');
  const parentXml=tag(xml,'parent');let parent=null;
  const relative=tag(parentXml,'relativePath')||(parentXml.includes('<relativePath/>')?'':'../pom.xml');
  if(parentXml&&relative){const pp=path.resolve(dir,relative);if(await exists(pp))parent=await readPom(path.dirname(pp),seen);}
  const props={...(parent?.properties||{})};
  for(const match of tag(xml,'properties').matchAll(/<([\w.-]+)>([^<]*)<\/\1>/g))props[match[1]]=decode(match[2].trim());
  const interpolate=s=>{for(let n=0;n<8;n++)s=s.replace(/\$\{([^}]+)\}/g,(all,key)=>props[key]??all);return s;};
  for(const key of Object.keys(props))props[key]=interpolate(props[key]);
  const own=xml.replace(/<parent>[\s\S]*?<\/parent>/g,'').replace(/<dependencies>[\s\S]*?<\/dependencies>/g,'').replace(/<build>[\s\S]*?<\/build>/g,'');
  const groupId=interpolate(tag(own,'groupId')||parent?.groupId||''), artifactId=interpolate(tag(own,'artifactId'));
  const dependencies=[...tag(xml,'dependencies').matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)].filter(m=>!['test','provided'].includes(tag(m[1],'scope'))).map(m=>({groupId:interpolate(tag(m[1],'groupId')),artifactId:interpolate(tag(m[1],'artifactId'))}));
  const modules=[...tag(xml,'modules').matchAll(/<module>([^<]+)<\/module>/g)].map(m=>path.resolve(dir,interpolate(m[1].trim())));
  const required=interpolate(props['maven.compiler.release']||props['java.version']||props['maven.compiler.target']||'');
  const major=/^(?:1\.)?(\d+)$/.exec(required)?.[1];
  return {dir,groupId,artifactId,properties:props,dependencies,modules,parent,requiredJavaMajor:major?Number(major):parent?.requiredJavaMajor||null,packaging:tag(own,'packaging')||'jar',boot:/spring-boot/.test(xml)||!!parent?.boot};
}
