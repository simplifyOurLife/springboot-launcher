// 候选发现改编自 DSH Spring Boot Launcher (Apache-2.0, qiyifeng)。
// 修改：使用异步探测、原生 Java 参数数组；不依赖 DSH shell。
import {existsSync,readdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readSmall} from './paths.mjs';
import {fail} from '../core/errors.mjs';
const exec=promisify(execFile);
export function detectJdkInstallations(env=process.env) {
  const candidates=[],seen=new Set(),java=process.platform==='win32'?'java.exe':'java';
  const variable=name=>Object.entries(env).find(([key])=>key.toUpperCase()===name)?.[1];
  const add=(input,source)=>{if(!input||candidates.length>=64)return;try{const home=realpathSync(path.resolve(String(input).trim().replace(/^"(.*)"$/,'$1')));const key=process.platform==='win32'?home.toLowerCase():home;if(!seen.has(key)&&existsSync(path.join(home,'bin',java))){seen.add(key);candidates.push({home,source});}}catch{/* 候选不可读时继续发现。 */}};
  add(variable('JAVA_HOME'),'JAVA_HOME');
  for(const [key,value] of Object.entries(env))if(/^(?:JDK_HOME|JAVA_HOME_\d+(?:_X64)?|JAVA\d+_HOME)$/i.test(key))add(value,key);
  for(const dir of String(variable('PATH')||'').split(path.delimiter).filter(Boolean))try{add(path.dirname(path.dirname(realpathSync(path.join(dir.trim().replace(/^"|"$/g,''),java)))),'PATH');}catch{/* 跳过无 Java 的 PATH 项。 */}
  const roots=['C:/Program Files/Java','C:/Program Files/Eclipse Adoptium','C:/Program Files/Microsoft','C:/Program Files/Amazon Corretto','C:/Program Files/Zulu','C:/Program Files/BellSoft'];
  // 已知安装的同级目录常用于 D:\jdk\jdk8、jdk17 等多版本布局。
  for(const item of candidates)roots.push(path.dirname(item.home));
  if(variable('USERPROFILE'))roots.push(path.join(variable('USERPROFILE'),'.jdks'));
  for(const root of roots)try{for(const entry of readdirSync(root).slice(0,1000))add(path.join(root,entry),'安装目录');}catch{/* 可选安装目录。 */}
  return candidates;
}
export const detectJdkCandidates=(env=process.env)=>detectJdkInstallations(env).map(item=>item.home);
export function javaMajor(version){const match=String(version).match(/(?:version\s+"?|(?:openjdk|java)\s+)?(\d+)(?:\.(\d+))?/i);return match?(Number(match[1])===1?Number(match[2]):Number(match[1])):null;}

// 面板扫描只读取 JDK release 元数据；真正启动仍用 java -version 再校验，避免执行扫描到的未知程序。
export async function scanJdks({requiredJavaMajor=8,projectDir,env=process.env,candidates=detectJdkInstallations(env)}={}){
  let hint='';
  if(projectDir){
    const ide=await readSmall(path.join(projectDir,'.idea/misc.xml'),65536).catch(()=>'');
    hint=ide.match(/project-jdk-name="([^"<>]{1,128})"/)?.[1]||'';
    if(!hint)hint=(await readSmall(path.join(projectDir,'.java-version'),1024).catch(()=>'')).trim().slice(0,128);
  }
  const jdks=await Promise.all(candidates.slice(0,64).map(async item=>{
    const release=await readSmall(path.join(item.home,'release'),32768).catch(()=>'');
    const version=release.match(/^JAVA_VERSION="([^"]+)"/m)?.[1]||null,major=version?javaMajor(version):null;
    const vendor=release.match(/^IMPLEMENTOR="([^"]+)"/m)?.[1]||null;
    const compiler=existsSync(path.join(item.home,'bin',process.platform==='win32'?'javac.exe':'javac'));
    return {...item,version,major,vendor,compatible:!!major&&major>=requiredJavaMajor&&compiler,reason:!compiler?'缺少 javac':!major?'版本未识别':major<requiredJavaMajor?`项目要求 Java ${requiredJavaMajor}+`:null};
  }));
  const suitable=jdks.filter(item=>item.compatible),hintMajor=hint?javaMajor(hint):null;
  const preferred=suitable.find(item=>hint&&(path.basename(item.home).toLowerCase().includes(hint.toLowerCase())||hintMajor===item.major))||suitable[0];
  return {jdks,recommendedJdkHome:preferred?.home||null,jdkHint:hint||null,requiredJavaMajor,warnings:preferred?[]:[`未发现满足 Java ${requiredJavaMajor}+ 的 JDK，可选择自定义目录；启动时会校验版本`]};
}
export async function resolveJdk({jdkHome,requiredJavaMajor,env=process.env,probeVersion}={}) {
  const probe=probeVersion|| (async executable=>{const result=await exec(executable,['-version'],{shell:false,windowsHide:true,timeout:3000,maxBuffer:16384});return result.stderr+result.stdout;});
  for(const home of jdkHome?[path.resolve(jdkHome)]:detectJdkCandidates(env)){
    const executable=path.join(home,'bin',process.platform==='win32'?'java.exe':'java');
    try{const match=String(await probe(executable)).match(/(?:version\s+"?|(?:openjdk|java)\s+)(\d+)(?:\.(\d+))?/i);const major=match?(Number(match[1])===1?Number(match[2]):Number(match[1])):null;if(major&&major>=(requiredJavaMajor||8))return {home,executable,major};}catch{/* 不符合的 JDK 不启动应用。 */}
  }
  fail('JDK_NOT_FOUND',`找不到可用 JDK${requiredJavaMajor?` ${requiredJavaMajor}+`:''}，请指定 jdkHome`);
}
