import {readPom} from './pom.mjs';
import {fail} from '../core/errors.mjs';

// 展开整个 reactor 后再沿声明依赖求闭包，不能将同仓库其他服务挂到当前应用。
export async function reactorDependencies(dir,reactorRoot){
  const modules=new Map(),seen=new Set();
  async function collect(moduleDir,depth=0){
    if(seen.has(moduleDir))return;
    if(depth>12||seen.size>=256)fail('UNSUPPORTED_PROJECT','Maven 模块展开超过上限');
    seen.add(moduleDir);const pom=await readPom(moduleDir);
    if(pom.groupId&&pom.artifactId)modules.set(`${pom.groupId}:${pom.artifactId}`,pom);
    for(const child of pom.modules)await collect(child,depth+1);
  }
  await collect(reactorRoot||dir);
  const app=await readPom(dir),result=[],visited=new Set([dir]);
  async function visit(pom){for(const dep of pom.dependencies){const target=modules.get(`${dep.groupId}:${dep.artifactId}`);if(!target||visited.has(target.dir))continue;visited.add(target.dir);result.push(target);await visit(target);}}
  await visit(app);return result;
}
