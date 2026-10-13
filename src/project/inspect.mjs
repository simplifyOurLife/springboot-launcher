import path from 'node:path';
import {normalizeProjectDir,walk,readSmall,exists} from './paths.mjs';
import {readPom} from './pom.mjs';
import {readManifest} from './jar-manifest.mjs';
import {inspectSpringProfiles} from './profiles.mjs';
import {findMainClasses} from './main-classes.mjs';
export async function inspectProject(input) {
  const {dir,projectKey}=await normalizeProjectDir(input),pom=await readPom(dir),mainClasses=await findMainClasses(dir),warnings=[];
  const profileInfo=await inspectSpringProfiles(dir);warnings.push(...profileInfo.warnings);
  let srcNewestMtime=(await exists(path.join(dir,'pom.xml')))?.mtimeMs||0;
  for(const file of await walk(path.join(dir,'src/main'),{depth:32})){
    srcNewestMtime=Math.max(srcNewestMtime,(await exists(file))?.mtimeMs||0);
  }
  let port=8080;
  for(const name of ['application.properties','application.yml','application.yaml']){
    const content=await readSmall(path.join(dir,'src/main/resources',name));
    const parsed=content.match(/(?:^|\n)\s*server\.port\s*=\s*(\d+)/)?.[1]||content.match(/(?:^|\n)server:\s*\n\s+port:\s*(\d+)/)?.[1];if(parsed&&Number(parsed)>0&&Number(parsed)<65536)port=Number(parsed);
  }
  const targetFiles=await walk(path.join(dir,'target'),{depth:32}),jarCandidates=[];
  for(const file of targetFiles.filter(f=>path.dirname(f)===path.join(dir,'target')&&f.endsWith('.jar')&&!/-(?:sources|javadoc)\.jar$/.test(f)))try{const manifest=await readManifest(file);if(manifest.mainClass)jarCandidates.push({path:file,...manifest,mtime:(await exists(file)).mtimeMs});}catch{warnings.push(`无法使用产物 ${path.basename(file)}`);}
  const classDirs=await exists(path.join(dir,'target/classes'))?[path.join(dir,'target/classes')]:[];
  const allDependencies=targetFiles.filter(f=>f.endsWith('.jar')&&['lib','dependency'].includes(path.basename(path.dirname(f))));
  const dependencyDirs=[...new Set(allDependencies.map(file=>path.dirname(file)))].sort((a,b)=>{
    const rank=library=>library===path.join(dir,'target/lib')?0:library===path.join(dir,'target/dependency')?1:2;
    return rank(a)-rank(b)||a.localeCompare(b);
  });
  const dependencyJars=allDependencies.filter(file=>path.dirname(file)===dependencyDirs[0]);
  let reactor=pom;while(reactor.parent?.modules.length)reactor=reactor.parent;
  const resourceDirs=await exists(path.join(dir,'target/config'))?[path.join(dir,'target/config')]:[];
  return {matched:pom.packaging!=='pom'&&(mainClasses.length>0||jarCandidates.some(j=>j.startClass)),projectKey,dir,mainClasses,...profileInfo,port,requiredJavaMajor:pom.requiredJavaMajor,reactorRoot:reactor.dir,artifacts:{jarCandidates,classDirs,resourceDirs,dependencyJars,dependencyDirs,srcNewestMtime},warnings};
}
