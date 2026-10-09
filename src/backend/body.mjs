import {LauncherError} from '../core/errors.mjs';
import {LIMITS} from '../core/contracts.mjs';
export function readJson(req,{limit=LIMITS.bodyBytes,timeout=5000}={}){
  return new Promise((resolve,reject)=>{
    let size=0,finished=false;const chunks=[];
    const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);req.removeListener('data',onData);req.removeListener('end',onEnd);req.removeListener('aborted',onAbort);req.removeListener('error',onError);if(error){req.resume();reject(error);}else resolve(value);};
    const onData=chunk=>{size+=chunk.length;if(size>limit)finish(new LauncherError('BODY_TOO_LARGE','请求体超过 64 KiB 限制'));else chunks.push(chunk);};
    const onEnd=()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(!value||Array.isArray(value)||typeof value!=='object')throw new Error();finish(null,value);}catch{finish(new LauncherError('INVALID_ARGUMENT','请求必须是 JSON 对象'));}};
    const onAbort=()=>finish(new LauncherError('INVALID_ARGUMENT','请求已断开')),onError=()=>finish(new LauncherError('INVALID_ARGUMENT','读取请求失败'));
    const timer=setTimeout(()=>finish(new LauncherError('REQUEST_TIMEOUT','读取请求超时')),timeout);
    req.on('data',onData);req.once('end',onEnd);req.once('aborted',onAbort);req.once('error',onError);
  });
}
