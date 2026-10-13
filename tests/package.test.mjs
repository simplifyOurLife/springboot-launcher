import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
test('发行包明确列出产品文件，排除测试、状态和秘密材料',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.ok(Array.isArray(pkg.files),'必须明确声明发行白名单');
  // npm test 提供 npm_execpath，直接执行 JS 入口，避免 Windows .cmd 和 shell 解析。
  const npmCli=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  const {stdout}=await promisify(execFile)(process.execPath,[npmCli,'pack','--dry-run','--json','--ignore-scripts'],{cwd:root,windowsHide:true,timeout:60000,maxBuffer:2*1024*1024});
  const files=JSON.parse(stdout)[0].files.map(file=>file.path);
  for(const expected of ['bin/springboot-launcher.mjs','src/logs/log-store.mjs','src/logs/ansi.mjs','src/runtime/daemon.mjs','src/backend/workspace.mjs','src/backend/folder-picker.mjs','web/index.html','web/app.mjs','scripts/private-dir.ps1','scripts/open-browser.ps1','scripts/select-project-folder.ps1','LICENSE','THIRD_PARTY_NOTICES.md','README.md','docs/usage/codex.md','docs/usage/claude-code.md'])assert.ok(files.includes(expected),`发行包缺少 ${expected}`);
  assert.ok(files.includes('examples/demo-service/pom.xml'));
  assert.ok(files.includes('scripts/run-maven.ps1'),'发行包必须包含 Windows Maven 参数执行脚本');
  assert.ok(files.includes('src/project/profiles.mjs'),'发行包必须包含 Profile 配置解析模块');
  for(const file of ['main-classes','reactor','build-instructions'])assert.ok(files.includes(`src/project/${file}.mjs`),`发行包必须包含 ${file}`);
  assert.equal(files.some(file=>/(?:^|\/)(?:node_modules|tests|target|\.superpowers|\.git|\.env)(?:\/|$)|instance\.json|services\.json|workspace\.json|backend\.(?:lock|guard)|\.(?:log|jar|class)$/.test(file)),false);
});
