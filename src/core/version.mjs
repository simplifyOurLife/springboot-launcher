import {readFileSync} from 'node:fs';
// CLI、MCP、后台与面板共用 package.json，避免升级后出现多个版本号。
export const APP_VERSION=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8')).version;
