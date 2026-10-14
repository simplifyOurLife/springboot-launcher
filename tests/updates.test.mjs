import test from 'node:test';
import assert from 'node:assert/strict';
import {compareVersions,releaseInfo,createAppUpdates} from '../src/runtime/updates.mjs';
const release=(version='0.2.0')=>({tag_name:`v${version}`,html_url:`https://github.com/simplifyOurLife/springboot-launcher/releases/tag/v${version}`,assets:[`springboot-launcher-v${version}-windows.zip`,'checksums.txt'].map(name=>({name,browser_download_url:`https://github.com/simplifyOurLife/springboot-launcher/releases/download/v${version}/${name}`}))});
test('按版本数字比较，拒绝预发布和外部下载来源',()=>{
  assert.equal(compareVersions('0.10.0','0.2.0'),1);assert.equal(compareVersions('0.2.0','0.2.0'),0);
  assert.equal(releaseInfo(release(),'0.1.0').installable,true);
  assert.throws(()=>releaseInfo({...release(),prerelease:true}));
  assert.throws(()=>releaseInfo({...release(),html_url:'https://other.example/releases/v0.2.0'}));
  const changed=release();changed.assets[0].browser_download_url='https://other.example/archive.zip';assert.equal(releaseInfo(changed).installable,false);
  assert.equal(releaseInfo({...release(),assets:[]}).installable,false);
});
test('更新检查共享并发、使用缓存，网络错误和无发行版不影响应用',async()=>{
  let count=0;const app=createAppUpdates({version:'0.1.0',readRelease:async()=>{count++;return {status:200,release:release()};}});
  const both=await Promise.all([app.check(),app.check()]);assert.equal(count,1);assert.equal(both[0].available,true);
  await app.check();assert.equal(count,1);await app.check({force:true});assert.equal(count,2);
  assert.equal((await createAppUpdates({readRelease:async()=>({status:404})}).check()).state,'unpublished');
  assert.equal((await createAppUpdates({readRelease:async()=>{throw new Error('离线');}}).check()).state,'unavailable');
});
