import net from 'node:net';
export function probePort(port,timeout=500){
  if(!port)return Promise.resolve(false);
  return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});let settled=false;const end=value=>{if(!settled){settled=true;socket.destroy();resolve(value);}};socket.setTimeout(timeout,()=>end(false));socket.once('connect',()=>end(true));socket.once('error',()=>end(false));});
}
export async function checkHealth(url){
  try{const address=new URL(url);if(address.hostname!=='127.0.0.1'||address.protocol!=='http:')return {ready:false,evidence:[],reason:'健康检查仅支持本机 HTTP'};
    const response=await fetch(address,{signal:AbortSignal.timeout(1500),redirect:'error'});if(!response.ok)return {ready:false,evidence:[],reason:`健康接口返回 ${response.status}`};
    const content=await response.text();if(content.length>65536)return {ready:false,evidence:[],reason:'健康响应过大'};
    const data=JSON.parse(content);return {ready:data.status==='UP',evidence:data.status==='UP'?['actuator']:[],reason:data.status==='UP'?'健康检查成功':'健康检查未确认 UP'};
  }catch{return {ready:false,evidence:[],reason:'健康检查未确认'};}
}
