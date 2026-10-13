import path from 'node:path';
import {walk,readSmall} from './paths.mjs';

// 入口决定模块是否是服务；继承 Boot parent、依赖 starter 或拥有 classes 都不能代替入口。
export async function findMainClasses(dir){
  const mains=[];
  for(const file of await walk(path.join(dir,'src/main/java'),{depth:32})){
    if(!file.endsWith('.java'))continue;
    const original=await readSmall(file);
    // 排除注释和字符串中的示例注解，保留源码换行，避免基础模块被文档示例误识别。
    const code=original.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,match=>match.replace(/[^\r\n]/g,' '));
    if(!/@(?:[\w$]+\.)*(?:SpringBootApplication|SpringBootConfiguration)\b/.test(code)||!/(?:public\s+static|static\s+public)\s+void\s+main\s*\(/.test(code))continue;
    const pkg=code.match(/\bpackage\s+([\w.]+)\s*;/)?.[1],cls=code.match(/\b(?:public\s+)?(?:final\s+)?class\s+([\w$]+)/)?.[1];
    if(cls)mains.push(pkg?`${pkg}.${cls}`:cls);
  }
  return [...new Set(mains)];
}
