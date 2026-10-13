import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import path from 'node:path';
import {fail} from '../core/errors.mjs';

const execute = promisify(execFile);

export async function pickProjectDirectory({signal, platform = process.platform, run = execute} = {}) {
  if (platform !== 'win32') fail('PICKER_UNAVAILABLE', '当前版本的系统目录选择仅支持 Windows');
  // 固定脚本通过参数数组执行，不将网页输入拼接进 PowerShell 命令。
  const script = await readFile(new URL('../../scripts/select-project-folder.ps1', import.meta.url), 'utf8');
  const args = ['-NoLogo', '-NoProfile', '-STA', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
  let result;
  try {
    try { result = await run('pwsh.exe', args, {windowsHide: true, shell: false, timeout: 180000, maxBuffer: 65536, signal, encoding: 'utf8'}); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const legacy = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
      result = await run(legacy, args, {windowsHide: true, shell: false, timeout: 180000, maxBuffer: 65536, signal, encoding: 'utf8'});
    }
    const value = JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim());
    if (value.cancelled === true) return null;
    if (typeof value.dir !== 'string' || !path.win32.isAbsolute(value.dir)) throw new Error('目录选择返回值无效');
    return value.dir;
  } catch (error) {
    if (signal?.aborted) fail('PICKER_CANCELLED', '目录选择已取消');
    if (error.killed) fail('PICKER_TIMEOUT', '目录选择已超时，请重新点击加号');
    fail('PICKER_UNAVAILABLE', '无法打开系统目录选择，请检查 Windows PowerShell 环境后重试');
  }
}
