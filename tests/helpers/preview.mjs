// 仅供人工/浏览器验收的隔离示例，不能作为真实 Spring Boot 验收证据。
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fixture} from './project-fixtures.mjs';
import {ensureBackend} from '../../src/runtime/instance.mjs';
import {createBackendClient} from '../../src/runtime/client.mjs';
const f=await fixture(),home=path.join(f.root,'预览后台');
await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./connect-worker.mjs',import.meta.url)),home]);
const client=createBackendClient(await ensureBackend({home})),result=await client.dashboard();
const info={home,dir:f.dir,root:f.root,url:result.data.url};
await writeFile('.superpowers/sdd/2026-10-09-shared-springboot-launcher-mvp/preview.json',JSON.stringify(info));
console.log(JSON.stringify({url:info.url,dir:info.dir}));
