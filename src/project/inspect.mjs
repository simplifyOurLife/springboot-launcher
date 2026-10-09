import path from 'node:path';
import {normalizeProjectDir,walk,readSmall,exists} from './paths.mjs';
import {readPom} from './pom.mjs';
import {readManifest} from './jar-manifest.mjs';
export async function inspectProject(input) {
  const {dir,projectKey}=await normalizeProjectDir(input),pom=await readPom(dir),mainClasses=[],profiles=[],warnings=[];
  let srcNewestMtime=(await exists(path.join(dir,'pom.xml')))?.mtimeMs||0;
  for(const file of await walk(path.join(dir,'src/main'))){
    srcNewestMtime=Math.max(srcNewestMtime,(await exists(file))?.mtimeMs||0);
    if(file.endsWith('.java')){const code=await readSmall(file);if(/(?:@SpringBootApplication|@SpringBootConfiguration)/.test(code)&&/static\s+void\s+main\s*\(/.test(code)){const pkg=code.match(/package\s+([\w.]+)\s*;/)?.[1];const cls=code.match(/(?:public\s+)?class\s+(\w+)/)?.[1];if(pkg&&cls)mainClasses.push(`${pkg}.${cls}`);}}
    const profile=path.basename(file).match(/^application-(.+)\.(?:properties|ya?ml)$/)?.[1];if(profile)profiles.push(profile);
  }
  let port=8080;
  for(const name of ['application.properties','application.yml','application.yaml']){
    const content=await readSmall(path.join(dir,'src/main/resources',name));
    const parsed=content.match(/(?:^|\n)\s*server\.port\s*=\s*(\d+)/)?.[1]||content.match(/(?:^|\n)server:\s*\n\s+port:\s*(\d+)/)?.[1];if(parsed&&Number(parsed)>0&&Number(parsed)<65536)port=Number(parsed);
  }
  const targetFiles=await walk(path.join(dir,'target')),jarCandidates=[];
  for(const file of targetFiles.filter(f=>path.dirname(f)===path.join(dir,'target')&&f.endsWith('.jar')&&!/-(?:sources|javadoc)\.jar$/.test(f)))try{const manifest=await readManifest(file);if(manifest.mainClass)jarCandidates.push({path:file,...manifest,mtime:(await exists(file)).mtimeMs});}catch{warnings.push(`无法使用产物 ${path.basename(file)}`);}
  const classDirs=await exists(path.join(dir,'target/classes'))?[path.join(dir,'target/classes')]:[];
  const dependencyJars=targetFiles.filter(f=>f.endsWith('.jar')&&['lib','dependency'].includes(path.basename(path.dirname(f))));
  let reactor=pom;while(reactor.parent?.modules.length)reactor=reactor.parent;
  return {matched:pom.packaging!=='pom'&&(pom.boot||mainClasses.length>0||jarCandidates.some(j=>j.startClass)),projectKey,dir,mainClasses,profiles:[...new Set(profiles)],port,requiredJavaMajor:pom.requiredJavaMajor,reactorRoot:reactor.dir,artifacts:{jarCandidates,classDirs,dependencyJars,srcNewestMtime},warnings};
}
