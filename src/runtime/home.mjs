import path from 'node:path';
import {fail} from '../core/errors.mjs';
export function runtimeHome(env=process.env){const dir=env.SPRINGBOOT_LAUNCHER_HOME||(env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'springboot-launcher'));if(!dir||!path.isAbsolute(dir))fail('INVALID_ARGUMENT','需要绝对的 SPRINGBOOT_LAUNCHER_HOME 或 Windows LOCALAPPDATA');return path.resolve(dir);}
