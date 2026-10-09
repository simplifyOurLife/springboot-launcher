import {spawn as nativeSpawn} from 'node:child_process';
export function createJavaExecutor({spawn=nativeSpawn}={}) {
  return {spawn(plan){return spawn(plan.executable,plan.args,{cwd:plan.dir,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});}};
}
