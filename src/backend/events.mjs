import {LIMITS} from '../core/contracts.mjs';
export function createEventStream(res,{maxBytes=LIMITS.logBytes,onClose=()=>{}}={}){
  let closed=false;
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
  const close=()=>{if(!closed){closed=true;clearInterval(heartbeat);onClose();res.end();}};
  const send=(name,data,id)=>{
    if(closed)return false;
    const frame=`${id===undefined?'':`id: ${id}\n`}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
    if(res.writableLength+Buffer.byteLength(frame)>maxBytes){close();return false;}
    res.write(frame);return true;
  };
  const heartbeat=setInterval(()=>{if(res.writableLength>maxBytes)close();else if(!closed)res.write(': heartbeat\n\n');},15000);heartbeat.unref();res.once('close',close);
  return {send,close,get queuedBytes(){return res.writableLength;}};
}
