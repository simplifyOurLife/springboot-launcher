import * as disk from 'node:fs/promises';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {stripVTControlCharacters} from 'node:util';
import {LIMITS} from '../core/contracts.mjs';
export function tailUtf8(value,maxBytes) {
  const bytes=Buffer.from(value);if(bytes.length<=maxBytes)return value;
  let start=bytes.length-maxBytes;while(start<bytes.length&&(bytes[start]&0xc0)===0x80)start++;
  return bytes.subarray(start).toString('utf8');
}
export function createLogStore({maxBytes=LIMITS.logBytes,fileBytes=LIMITS.fileBytes,fileCount=LIMITS.fileCount,clock=()=>new Date().toISOString(),fs=disk}={}) {
  const stores=new Map();
  const get=key=>stores.get(key);
  async function rotate(s){
    for(let n=fileCount-1;n>=1;n--){const from=n===1?s.file:`${s.file}.${n-1}`,to=`${s.file}.${n}`;await fs.rm(to,{force:true});try{await fs.rename(from,to);}catch(e){if(e.code!=='ENOENT')throw e;}}
    s.fileSize=0;
  }
  function append(key,source,input){
    const s=get(key);if(!s||s.closed||!input)return;
    const clean=stripVTControlCharacters(input),text=tailUtf8(clean,maxBytes);if(!text)return;
    if(text!==clean)s.lostPrefix=true;
    const event={projectKey:key,seq:++s.seq,time:clock(),source,text};s.events.push(event);s.bytes+=Buffer.byteLength(text);
    while(s.bytes>maxBytes&&s.events.length){const removed=s.events.shift();s.bytes-=Buffer.byteLength(removed.text);s.lostPrefix=true;}
    for(const listener of s.listeners)try{listener(event);}catch{/* 单个查看者不能中断采集。 */}
    if(!s.persistenceError){
      const amount=Buffer.byteLength(clean);
      if(s.pendingBytes+amount>maxBytes){s.persistenceError='日志写入积压，部分文件输出已省略；实时日志仍可查看';return;}
      s.pendingBytes+=amount;
      s.queue=s.queue.then(async()=>{
        const bytes=Buffer.from(clean);let offset=0;
        while(offset<bytes.length){
          if(s.fileSize>=fileBytes)await rotate(s);
          let length=Math.min(bytes.length-offset,fileBytes-s.fileSize);
          while(length>0&&offset+length<bytes.length&&(bytes[offset+length]&0xc0)===0x80)length--;
          if(!length){await rotate(s);continue;}
          await fs.appendFile(s.file,bytes.subarray(offset,offset+length));s.fileSize+=length;offset+=length;
        }
      }).catch(()=>{s.persistenceError='日志文件写入失败；实时日志仍可查看';}).finally(()=>{s.pendingBytes-=amount;});
    }
  }
  return {
    async open(key,dir){
      const existing=get(key);if(existing&&!existing.closed)return existing.file;
      const s={file:path.join(dir,'logs/springboot-launcher.log'),fileSize:0,seq:existing?.seq||0,events:existing?.events||[],bytes:existing?.bytes||0,listeners:existing?.listeners||new Set(),lostPrefix:existing?.lostPrefix||false,closed:false,decoders:{stdout:new StringDecoder('utf8'),stderr:new StringDecoder('utf8')},queue:Promise.resolve(),pendingBytes:0,persistenceError:null};stores.set(key,s);
      try{await fs.mkdir(path.dirname(s.file),{recursive:true});s.fileSize=(await fs.stat(s.file).catch(()=>({size:0}))).size;if(s.fileSize>fileBytes)await rotate(s);}catch{s.persistenceError='无法创建日志文件；实时日志仍可查看';}
      return s.file;
    },
    appendChunk(key,source,bytes){const s=get(key);if(!s)return;append(key,source,source==='system'?Buffer.from(bytes).toString('utf8'):s.decoders[source].write(bytes));},
    finishStream(key,source){const s=get(key);if(s?.decoders[source])append(key,source,s.decoders[source].end());},
    snapshot(key,{after=0,lines=100,maxBytes:cap=LIMITS.mcpBytes}={}){
      const s=get(key);if(!s)return {events:[],lastSeq:0,gap:false,text:'',truncated:false,persistenceError:null};
      const candidates=s.events.filter(e=>e.seq>after),raw=candidates.map(e=>e.text).join('');
      let text=tailUtf8(raw,Math.min(cap,maxBytes));const parts=text.split('\n');if(parts.length>lines)text=parts.slice(-lines).join('\n');
      let remaining=Buffer.byteLength(text);const events=[];
      for(let i=candidates.length-1;i>=0&&remaining>0;i--){const e=candidates[i],part=tailUtf8(e.text,remaining);events.unshift({...e,text:part});remaining-=Buffer.byteLength(part);}
      return {events,lastSeq:s.seq,gap:(after<s.seq&&((s.events[0]?.seq||0)>after+1||s.lostPrefix&&after<(s.events[0]?.seq||0))),text,truncated:text!==raw,persistenceError:s.persistenceError};
    },
    subscribe(key,listener){const s=get(key);if(!s)return ()=>{};s.listeners.add(listener);return ()=>s.listeners.delete(listener);},
    async flush(key){await get(key)?.queue;},
    async close(key){const s=get(key);if(!s||s.closed)return;this.finishStream(key,'stdout');this.finishStream(key,'stderr');s.closed=true;await s.queue;}
  };
}
