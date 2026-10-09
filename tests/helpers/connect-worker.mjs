import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {appendFile,readFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import path from 'node:path';
import {ensureBackend} from '../../src/runtime/instance.mjs';
const home=process.argv[2];
let connection;try{connection=await ensureBackend({home,spawnBackend:async({instanceId})=>{
  await appendFile(path.join(home,'spawn-count.txt'),'spawn\n');
  const fd=openSync(path.join(home,'test-stderr.txt'),'a');
  const child=spawn(process.execPath,[fileURLToPath(new URL('./backend-worker.mjs',import.meta.url)),home,instanceId],{detached:true,windowsHide:true,stdio:['ignore','ignore',fd]});closeSync(fd);child.unref();return child;
}});}catch(error){console.error(error.cause?.stderr||await readFile(path.join(home,'test-stderr.txt'),'utf8').catch(()=>''));throw error;}
console.log(JSON.stringify({instanceId:connection.instanceId}));
