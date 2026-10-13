import {fail} from './errors.mjs';
/** @typedef {{projectKey:string,seq:number,time:string,source:'stdout'|'stderr'|'system',text:string}} LogEvent */
/** @typedef {{ok:true,data:unknown}|{ok:false,error:{code:string,message:string,details?:unknown}}} Result */
export const TOOL_NAMES = ['spring_boot_discover','spring_boot_inspect','spring_boot_start','spring_boot_status','spring_boot_logs','spring_boot_stop','spring_boot_restart','spring_boot_dashboard'];
export const LIMITS = Object.freeze({logBytes:524288,fileBytes:10485760,fileCount:4,mcpBytes:262144,lines:1000,bodyBytes:65536});
export function text(value,label,{optional=false,max=4096}={}) {
  if(value===undefined&&optional)return;
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value))fail('INVALID_ARGUMENT',`${label} 必须是有效的文本`);
}
export function validateTool(name,args={}) {
  const fields={spring_boot_discover:['root','depth','maxDirs','timeoutMs'],spring_boot_inspect:['dir'],spring_boot_start:['dir','profile','port','jdkHome','mode','jarPath','mainClass','classpath','jvmArgs','healthUrl','noBuild','mvnOffline'],spring_boot_status:['dir'],spring_boot_logs:['dir','lines','after'],spring_boot_stop:['dir'],spring_boot_restart:['dir'],spring_boot_dashboard:[]}[name];
  if(!fields||!args||typeof args!=='object'||Array.isArray(args))fail('INVALID_ARGUMENT','工具名称或参数无效');
  for(const key of Object.keys(args))if(!fields.includes(key))fail('INVALID_ARGUMENT',`不支持参数 ${key}`);
  for(const key of ['noBuild','mvnOffline'])if(args[key]!==undefined&&typeof args[key]!=='boolean')fail('INVALID_ARGUMENT',`${key} 必须是布尔值`);
  if(name==='spring_boot_discover')text(args.root,'root');
  if(!['spring_boot_discover','spring_boot_dashboard','spring_boot_status'].includes(name))text(args.dir,'dir');
  if(args.dir!==undefined)text(args.dir,'dir');
  for(const field of ['profile','jdkHome','jarPath','mainClass'])if(args[field]!==undefined)text(args[field],field);
  if(args.profile!==undefined&&!/^[\w.,-]+$/.test(args.profile))fail('INVALID_ARGUMENT','profile 格式无效');
  if(args.mainClass!==undefined&&!/^[\w$]+(?:\.[\w$]+)+$/.test(args.mainClass))fail('INVALID_ARGUMENT','mainClass 格式无效');
  if(args.port!==undefined&&(!Number.isInteger(args.port)||args.port<1||args.port>65535))fail('INVALID_ARGUMENT','端口必须是 1–65535 的整数');
  if(args.mode!==undefined&&!['auto','jar','classpath'].includes(args.mode))fail('INVALID_ARGUMENT','运行模式无效');
  if(args.healthUrl!==undefined){
    text(args.healthUrl,'healthUrl');let url;try{url=new URL(args.healthUrl);}catch{fail('INVALID_ARGUMENT','健康检查地址无效');}
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.hash)fail('INVALID_ARGUMENT','健康检查仅允许无凭据的本机 HTTP 地址');
  }
  for(const field of ['classpath','jvmArgs'])if(args[field]!==undefined){
    if(!Array.isArray(args[field])||!args[field].length||args[field].length>2000)fail('INVALID_ARGUMENT',`${field} 必须是有限的非空数组`);
    for(const value of args[field])text(value,field);
  }
  for(const token of args.jvmArgs||[])if(!/^-(?:D[^=\s]+(?:=.*)?|X(?:ms|mx|ss)[\w]+|XX:[+\-]?[\w]+(?:=[\w.,:/\\-]+)?|ea|da|esa|dsa)$/.test(token))fail('INVALID_ARGUMENT','JVM 参数仅允许 -D、内存选项、-XX 和断言选项');
  for(const [field,min,max] of [['lines',1,1000],['after',0,Number.MAX_SAFE_INTEGER],['depth',0,10],['maxDirs',1,2000],['timeoutMs',1,5000]])
    if(args[field]!==undefined&&(!Number.isSafeInteger(args[field])||args[field]<min||args[field]>max))fail('INVALID_ARGUMENT',`${field} 超出允许范围`);
  return args;
}
