import test from 'node:test';
import assert from 'node:assert/strict';
import {runCli} from '../bin/springboot-launcher.mjs';
test('帮助与非法参数不创建后台',async()=>{
  let output='';const options={stdout:{write:value=>{output+=value;}},stderr:{write:value=>{output+=value;}},connect:()=>assert.fail('不能创建后台')};
  assert.equal(await runCli(['--help'],options),0);assert.ok(output.includes('dashboard'));assert.equal(await runCli(['status','--unknown'],options),2);
});
test('遗忘记录要求明确确认并通过专用接口',async()=>{
  let forwarded;const connect=async()=>({confirmOrphan:async(dir,args)=>{forwarded={dir,args};return {ok:true,data:{status:'stopped'}};}}),stream={write(){}};
  assert.equal(await runCli(['daemon','forget','--dir','C:/demo'],{connect,stdout:stream,stderr:stream}),2);
  assert.equal(await runCli(['daemon','forget','--dir','C:/demo','--confirm-orphan'],{connect,stdout:stream,stderr:stream}),0);assert.deepEqual(forwarded,{dir:'C:/demo',args:{acknowledge:true}});
});
