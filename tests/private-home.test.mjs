import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fixture} from './helpers/project-fixtures.mjs';
import {preparePrivateHome} from '../src/runtime/private-dir.mjs';

test('并发初始化等待另一进程完成私有目录标记，不把进行中的写入当成外部目录',async t=>{
  const f=await fixture(),home=path.join(f.root,'并发初始化');t.after(f.cleanup);
  await mkdir(home);const marker=path.join(home,'.launcher-owned');await writeFile(marker,'');
  const writing=new Promise((resolve,reject)=>setTimeout(()=>writeFile(marker,'springboot-launcher/v1').then(resolve,reject),80));
  t.after(()=>writing);
  assert.equal(await preparePrivateHome(home),home);await writing;
  assert.equal(await readFile(marker,'utf8'),'springboot-launcher/v1');
});

test('初始化仍拒绝接管带普通文件的非空目录，不覆盖原文件',async t=>{
  const f=await fixture(),home=path.join(f.root,'用户目录');t.after(f.cleanup);
  await mkdir(home);await writeFile(path.join(home,'user.txt'),'保留');
  await assert.rejects(preparePrivateHome(home),{code:'INVALID_ARGUMENT'});
  assert.equal(await readFile(path.join(home,'user.txt'),'utf8'),'保留');
});
