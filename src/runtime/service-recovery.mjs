import {uptime} from 'node:os';
import {isAlive} from './instance.mjs';

// 只清理已确认结束的旧登记，不接管、终止或自动启动任何历史 PID。
export function recoverServiceRecords(records,{isProcessAlive=isAlive,systemUptime=uptime()}={}){
  return records.filter(record=>{
    // 系统运行时长不受校时影响。只有明确回退才能证明重启；历史记录缺少证据时保留保护。
    // 不能用 Date.now()-uptime() 与启动日期比较，否则时钟前调会误遗忘仍存活的 JVM。
    if(Number.isFinite(systemUptime)&&systemUptime>=0&&Number.isFinite(record?.lastSeenSystemUptime)&&record.lastSeenSystemUptime>systemUptime+5)return false;
    if(!Number.isInteger(record?.pid)||record.pid<1)return true;
    try{return isProcessAlive(record.pid)!==false;}
    catch{return true;} // 权限不足或探测失败不等于进程已退出。
  });
}
