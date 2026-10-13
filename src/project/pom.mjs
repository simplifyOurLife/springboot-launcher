import path from 'node:path';
import {readSmall,exists} from './paths.mjs';
import {fail} from '../core/errors.mjs';
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
export const tag=(xml,name)=>decode(xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1]?.trim()||'');
// 按 XML 层级取直接子项，避免把 dependencyManagement、插件配置或 profile 当作实际依赖。
function parse(xml){
  const root={name:'',children:[],text:''},stack=[root];let count=0;
  for(const token of xml.match(/<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g)||[]){
    if(++count>50000||stack.length>64)fail('UNSUPPORTED_PROJECT','POM 结构超过解析上限');
    if(token.startsWith('<?')||token.startsWith('<!--'))continue;
    if(token.startsWith('<![CDATA[')){stack.at(-1).text+=token.slice(9,-3);continue;}
    if(token.startsWith('</')){if(stack.length<2||stack.at(-1).name!==token.slice(2,-1).trim().split(':').at(-1))fail('UNSUPPORTED_PROJECT','POM XML 结构无效');stack.pop();}
    else if(token.startsWith('<')){const name=token.match(/^<([\w:.-]+)/)?.[1]?.split(':').at(-1);if(!name)fail('UNSUPPORTED_PROJECT','POM XML 标签无效');const node={name,children:[],text:''};stack.at(-1).children.push(node);if(!token.endsWith('/>'))stack.push(node);}
    else stack.at(-1).text+=token;
  }
  if(stack.length!==1)fail('UNSUPPORTED_PROJECT','POM XML 未闭合');
  return root.children.find(node=>node.name==='project')||root;
}
const child=(node,name)=>node?.children.find(item=>item.name===name);
const value=(node,name)=>decode(child(node,name)?.text.trim()||'');
// 仅解析本地 Maven 常见结构，不展开实体、不执行插件或读取远端 parent。
export async function readPom(dir,seen=new Set()) {
  if(seen.size>8||seen.has(dir))fail('UNSUPPORTED_PROJECT','Maven parent 循环或层级过深');
  seen.add(dir);let xml=(await readSmall(path.join(dir,'pom.xml'))).replace(/<!--[\s\S]*?-->/g,'');
  if(!xml)fail('UNSUPPORTED_PROJECT','首版需要包含 pom.xml 的 Maven 应用模块');
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))fail('UNSUPPORTED_PROJECT','不支持包含实体声明的 POM');
  const project=parse(xml),parentNode=child(project,'parent');let parent=null;
  const relative=child(parentNode,'relativePath')?value(parentNode,'relativePath'):'../pom.xml';
  if(parentNode&&relative){const pp=path.resolve(dir,relative);if(await exists(pp))parent=await readPom(path.dirname(pp),seen);}
  const props={...(parent?.properties||{})};
  for(const item of child(project,'properties')?.children||[])props[item.name]=decode(item.text.trim());
  Object.assign(props,{'project.basedir':dir,basedir:dir,'project.groupId':value(project,'groupId')||parent?.groupId||value(parentNode,'groupId'),'project.artifactId':value(project,'artifactId'),'project.version':value(project,'version')||parent?.version||value(parentNode,'version')});
  const interpolate=s=>{for(let n=0;n<8;n++)s=s.replace(/\$\{([^}]+)\}/g,(all,key)=>props[key]??all);return s;};
  for(const key of Object.keys(props))props[key]=interpolate(props[key]);
  const groupId=interpolate(props['project.groupId']),artifactId=interpolate(props['project.artifactId']),version=interpolate(props['project.version']);
  const dependencies=[...(parent?.dependencies||[]),...(child(project,'dependencies')?.children||[]).filter(node=>node.name==='dependency'&&!['test','provided'].includes(value(node,'scope'))).map(node=>({groupId:interpolate(value(node,'groupId')),artifactId:interpolate(value(node,'artifactId')),version:interpolate(value(node,'version'))}))];
  const modules=(child(project,'modules')?.children||[]).filter(node=>node.name==='module').map(node=>path.resolve(dir,interpolate(decode(node.text.trim()))));
  const required=interpolate(props['maven.compiler.release']||props['java.version']||props['maven.compiler.target']||props['maven.compiler.source']||'');
  const major=/^(?:1\.)?(\d+)$/.exec(required)?.[1];
  return {dir,groupId,artifactId,version,properties:props,dependencies,modules,parent,requiredJavaMajor:major?Number(major):parent?.requiredJavaMajor||null,packaging:value(project,'packaging')||'jar',boot:/spring-boot/.test(xml)||!!parent?.boot};
}
