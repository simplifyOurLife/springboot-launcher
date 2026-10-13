import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './helpers/project-fixtures.mjs';
import {inspectSpringProfiles} from '../src/project/profiles.mjs';
import {detectJdkInstallations,scanJdks} from '../src/project/jdk.mjs';
import {prepareLaunch} from '../src/project/launch-plan.mjs';

async function config(f,name,text){const file=path.join(f.dir,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,text);}
test('YAML 嵌套、列表、多文档、分组与文件名枚举，条件文档不覆盖默认',async t=>{
  const f=await fixture();t.after(f.cleanup);
  await config(f,'src/main/resources/application.yml','spring:\n  profiles:\n    active: [local, metrics]\n    group:\n      production: [prod, metrics, worker]\n---\nspring:\n  config:\n    activate:\n      on-profile: "dev | qa"\n  profiles:\n    active: wrong\n');
  await config(f,'src/main/resources/application-prod.yaml','spring.profiles.active: invalid-default\n');
  const result=await inspectSpringProfiles(f.dir,{env:{}});
  assert.equal(result.activeProfile,'local,metrics');assert.ok(result.profiles.includes('production'));assert.ok(result.profiles.includes('prod'));assert.ok(result.profiles.includes('qa'));assert.ok(result.profiles.includes('worker'));
  assert.equal(result.profileSource,path.join('src/main/resources','application.yml'));
});
test('properties 优先于同目录 YAML，外部 config 优先且支持续行与 Unicode',async t=>{
  const f=await fixture();t.after(f.cleanup);
  await config(f,'src/main/resources/application.yaml','spring.profiles.active: yaml\n');
  await config(f,'src/main/resources/application.properties','spring.profiles.active=properties\n');
  assert.equal((await inspectSpringProfiles(f.dir,{env:{}})).activeProfile,'properties');
  await config(f,'config/application.properties','spring.profiles.active: q\\u0061,\\\n  metrics\n');
  assert.equal((await inspectSpringProfiles(f.dir,{env:{}})).activeProfile,'qa,metrics');
  await config(f,'config/application.properties','spring.profiles.active=base\n!---\nspring.config.activate.on-profile=prod\nspring.profiles.active=conditional\n');
  assert.equal((await inspectSpringProfiles(f.dir,{env:{}})).activeProfile,'base');
});
test('环境变量、占位符回退、未解析 Maven 参数和默认 Profile 有明确来源',async t=>{
  const f=await fixture();t.after(f.cleanup);
  await config(f,'src/main/resources/application.properties','spring.profiles.active=${APP_ENV:dev}\n');
  assert.equal((await inspectSpringProfiles(f.dir,{env:{}})).activeProfile,'dev');
  assert.equal((await inspectSpringProfiles(f.dir,{env:{APP_ENV:'qa'}})).activeProfile,'qa');
  const overridden=await inspectSpringProfiles(f.dir,{env:{SPRING_PROFILES_ACTIVE:'prod'}});assert.equal(overridden.activeProfile,'prod');assert.equal(overridden.profileSource,'SPRING_PROFILES_ACTIVE');
  await config(f,'src/main/resources/application.properties','spring.profiles.active=@env@\npassword=super-secret\n');
  const unresolved=await inspectSpringProfiles(f.dir,{env:{}});assert.equal(unresolved.activeProfile,null);assert.equal(unresolved.profileUnresolved,true);assert.ok(!JSON.stringify(unresolved).includes('super-secret'));
  await config(f,'src/main/resources/application.properties','spring.profiles.default=local\n');
  assert.equal((await inspectSpringProfiles(f.dir,{env:{}})).activeProfile,'local');
});
test('配置解析失败不暴露原文，target 副本兜底而源码优先',async t=>{
  const f=await fixture();t.after(f.cleanup);
  await config(f,'target/classes/application.yml','spring.profiles.active: compiled\n');
  assert.equal((await inspectSpringProfiles(f.dir,{env:{}})).activeProfile,'compiled');
  await config(f,'src/main/resources/application.yml','spring.profiles.active: local\n');
  await config(f,'config/application.yml','password: [super-secret\n');
  const result=await inspectSpringProfiles(f.dir,{env:{}});assert.equal(result.activeProfile,'local');assert.ok(result.warnings.length);assert.ok(!JSON.stringify(result).includes('super-secret'));
});
test('自动 Profile 作为检测结果返回，启动不擅自添加覆盖参数',async t=>{
  const f=await fixture();t.after(f.cleanup);await config(f,'src/main/resources/application.properties','spring.profiles.active=local\n');
  // 只注入 JDK 探测，不构建也不执行 Java。
  const plan=await prepareLaunch({dir:f.dir},{resolveJdk:async()=>({home:f.jdkHome,executable:path.join(f.jdkHome,'bin/java.exe'),major:17})});
  assert.equal(plan.profile,'local');assert.equal(plan.jdkHome,f.jdkHome);assert.equal(plan.args.some(arg=>arg.startsWith('--spring.profiles.active=')),false);
});
test('本机发现同级多版本安装，兼容性排除 JRE，项目提示优先',async t=>{
  const f=await fixture();t.after(f.cleanup);const homes=[];
  for(const major of [8,17,21]){
    const home=path.join(f.root,'jdks',`jdk-${major}`);homes.push(home);await mkdir(path.join(home,'bin'),{recursive:true});
    await writeFile(path.join(home,'bin',process.platform==='win32'?'java.exe':'java'),'模拟文件，不执行');
    if(major!==8)await writeFile(path.join(home,'bin',process.platform==='win32'?'javac.exe':'javac'),'模拟文件，不执行');
    await writeFile(path.join(home,'release'),`JAVA_VERSION="${major}.0.1"\nIMPLEMENTOR="测试 JDK"\n`);
  }
  const candidates=detectJdkInstallations({JAVA_HOME:`"${homes[0]}"`,PATH:''});
  assert.ok(candidates.some(item=>item.home===homes[1]));
  await config(f,'.idea/misc.xml','<component project-jdk-name="21"/>');
  const result=await scanJdks({projectDir:f.dir,requiredJavaMajor:17,candidates});
  assert.equal(result.recommendedJdkHome,homes[2]);assert.equal(result.jdks.find(item=>item.home===homes[0]).compatible,false);
  assert.equal(result.jdks.find(item=>item.home===homes[1]).compatible,true);
});
