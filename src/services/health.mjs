import net from 'node:net';
export function probePort(port,timeout=500){
  if(!port)return Promise.resolve(false);
  return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});let settled=false;const end=value=>{if(!settled){settled=true;socket.destroy();resolve(value);}};socket.setTimeout(timeout,()=>end(false));socket.once('connect',()=>end(true));socket.once('error',()=>end(false));});
}
export async function checkHealth(url,{timeoutMs=1500,request=fetch}={}){
  try{const address=new URL(url);if(address.hostname!=='127.0.0.1'||address.protocol!=='http:')return {ready:false,evidence:[],reason:'健康检查仅支持本机 HTTP'};
    if(address.username||address.password)return {ready:false,evidence:[],reason:'健康检查不允许地址凭据'};
    const response=await request(address,{signal:AbortSignal.timeout(timeoutMs),redirect:'error'});if(!response.ok){await response.body?.cancel();return {ready:false,evidence:[],reason:`健康接口返回 ${response.status}`};}
    // 在读取过程中限制响应，不能先将无界内容读入内存。
    const reader=response.body?.getReader();if(!reader)return {ready:false,evidence:[],reason:'健康响应为空'};
    const chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)return {ready:false,evidence:[],reason:'健康响应过大'};chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
    const content=Buffer.concat(chunks).toString('utf8');
    const data=JSON.parse(content);return {ready:data.status==='UP',evidence:data.status==='UP'?['actuator']:[],reason:data.status==='UP'?'健康检查成功':'健康检查未确认 UP'};
  }catch{return {ready:false,evidence:[],reason:'健康检查未确认'};}
}
