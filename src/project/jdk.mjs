// 候选发现改编自 DSH Spring Boot Launcher (Apache-2.0, qiyifeng)。
// 修改：使用异步探测、原生 Java 参数数组；不依赖 DSH shell。
import {existsSync,readdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fail} from '../core/errors.mjs';
const exec=promisify(execFile);
export function detectJdkCandidates(env=process.env) {
  const candidates=[],seen=new Set(),java=process.platform==='win32'?'java.exe':'java';
  const variable=name=>Object.entries(env).find(([key])=>key.toUpperCase()===name)?.[1];
  const add=input=>{if(!input)return;try{const home=realpathSync(path.resolve(input));const key=process.platform==='win32'?home.toLowerCase():home;if(!seen.has(key)&&existsSync(path.join(home,'bin',java))){seen.add(key);candidates.push(home);}}catch{/* 候选不可读时继续发现。 */}};
  add(variable('JAVA_HOME'));
  for(const dir of String(variable('PATH')||'').split(path.delimiter).filter(Boolean))try{add(path.dirname(path.dirname(realpathSync(path.join(dir.replace(/^"|"$/g,''),java)))));}catch{/* 跳过无 Java 的 PATH 项。 */}
  const roots=['C:/Program Files/Java','C:/Program Files/Eclipse Adoptium','C:/Program Files/Microsoft','C:/Program Files/Amazon Corretto','C:/Program Files/Zulu','C:/Program Files/BellSoft'];
  if(variable('USERPROFILE'))roots.push(path.join(variable('USERPROFILE'),'.jdks'));
  for(const root of roots)try{for(const entry of readdirSync(root))add(path.join(root,entry));}catch{/* 可选安装目录。 */}
  return candidates;
}
export async function resolveJdk({jdkHome,requiredJavaMajor,env=process.env,probeVersion}={}) {
  const probe=probeVersion|| (async executable=>{const result=await exec(executable,['-version'],{shell:false,windowsHide:true,timeout:3000,maxBuffer:16384});return result.stderr+result.stdout;});
  for(const home of jdkHome?[path.resolve(jdkHome)]:detectJdkCandidates(env)){
    const executable=path.join(home,'bin',process.platform==='win32'?'java.exe':'java');
    try{const match=String(await probe(executable)).match(/(?:version\s+"?|(?:openjdk|java)\s+)(\d+)(?:\.(\d+))?/i);const major=match?(Number(match[1])===1?Number(match[2]):Number(match[1])):null;if(major&&major>=(requiredJavaMajor||8))return {home,executable,major};}catch{/* 不符合的 JDK 不启动应用。 */}
  }
  fail('JDK_NOT_FOUND',`找不到可用 JDK${requiredJavaMajor?` ${requiredJavaMajor}+`:''}，请指定 jdkHome`);
}
