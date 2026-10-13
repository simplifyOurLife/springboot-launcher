import {mkdtemp, mkdir, writeFile, rm, utimes} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const fixtureHome=fileURLToPath(new URL('../../.superpowers/tmp/',import.meta.url));

// 仅合成最小 ZIP 元数据，不编译 Java，不执行 Maven。
export function zip(entries) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const n = Buffer.from(name), data = Buffer.from(text);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4);
    local.writeUInt32LE(data.length,18); local.writeUInt32LE(data.length,22); local.writeUInt16LE(n.length,26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20,6);
    central.writeUInt32LE(data.length,20); central.writeUInt32LE(data.length,24); central.writeUInt16LE(n.length,28); central.writeUInt32LE(offset,42);
    locals.push(local,n,data); centrals.push(central,n); offset += local.length+n.length+data.length;
  }
  const c = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(entries).length,8); end.writeUInt16LE(Object.keys(entries).length,10);
  end.writeUInt32LE(c.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,c,end]);
}

export async function fixture(kind='fat-jar', overrides={}) {
  await mkdir(fixtureHome,{recursive:true});
  const root = await mkdtemp(path.join(fixtureHome,'springboot-launcher-测试 '));
  const dirName = overrides.dirName || '中文 工程';
  if (path.basename(dirName) !== dirName || ['.', '..'].includes(dirName)) throw new Error('夹具项目名称只能是单个目录名');
  const dir = path.join(root,dirName), jdkHome = path.join(root,'JDK 路径');
  await mkdir(path.join(dir,'src/main/java/demo'),{recursive:true});
  await mkdir(path.join(dir,'target/classes/demo'),{recursive:true});
  await mkdir(path.join(jdkHome,'bin'),{recursive:true});
  await writeFile(path.join(jdkHome,'bin',process.platform==='win32'?'java.exe':'java'),'夹具，不执行');
  await writeFile(path.join(dir,'pom.xml'), overrides.pom || '<project><modelVersion>4.0.0</modelVersion><groupId>demo</groupId><artifactId>demo</artifactId><version>1</version><properties><java.version>17</java.version></properties><build><plugins><plugin><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build></project>');
  const source = path.join(dir,'src/main/java/demo/App.java');
  await writeFile(source,'package demo; @SpringBootApplication public class App { public static void main(String[] args) {} }');
  const past = new Date(Date.now()-60000); await utimes(source,past,past); await utimes(path.join(dir,'pom.xml'),past,past);
  const jarPath = path.join(dir,'target/demo.jar'), classDir = path.join(dir,'target/classes');
  if (kind!=='missing') await writeFile(path.join(classDir,'demo/App.class'),'合成 class');
  if (kind==='fat-jar'||kind==='stale'||kind==='ambiguous') {
    const data=zip({'META-INF/MANIFEST.MF':'Manifest-Version: 1.0\r\nMain-Class: org.springframework.boot.loader.launch.JarLauncher\r\nStart-Class: demo.App\r\n\r\n','BOOT-INF/classes/demo/App.class':'合成 class'});
    await writeFile(jarPath,data);
    if (kind==='ambiguous') await writeFile(path.join(dir,'target/other.jar'),data);
  } else if (kind==='thin-jar') {
    await writeFile(jarPath,zip({'META-INF/MANIFEST.MF':'Main-Class: demo.App\r\nClass-Path: lib/missing.jar\r\n\r\n'}));
  }
  if(kind==='stale') await utimes(source,new Date(Date.now()+5000),new Date(Date.now()+5000));
  return {root,dir,jdkHome,jarPath,mainClass:'demo.App',classDir,cleanup:async()=>{
    const resolved=path.resolve(root);
    if(path.dirname(resolved)!==path.resolve(fixtureHome)||!path.basename(resolved).startsWith('springboot-launcher-')) throw new Error('拒绝清理非夹具目录');
    await rm(resolved,{recursive:true,force:true});
  }};
}
