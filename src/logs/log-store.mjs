import * as disk from 'node:fs/promises';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {stripVTControlCharacters} from 'node:util';
import {LIMITS} from '../core/contracts.mjs';
const MAX_EVENTS=2000,CHUNK_BYTES=32768;
const sizeOf=value=>Buffer.byteLength(JSON.stringify(value));
export function tailUtf8(value,maxBytes) {
  const bytes=Buffer.from(value);if(bytes.length<=maxBytes)return value;
  let start=Math.max(0,bytes.length-maxBytes);while(start<bytes.length&&(bytes[start]&0xc0)===0x80)start++;
  return bytes.subarray(start).toString('utf8');
}
export function createLogStore({maxBytes=LIMITS.logBytes,fileBytes=LIMITS.fileBytes,fileCount=LIMITS.fileCount,clock=()=>new Date().toISOString(),fs=disk}={}) {
  const stores=new Map(),get=key=>stores.get(key);
  async function rotate(s){
    for(let n=fileCount-1;n>=1;n--){const from=n===1?s.file:s.file+'.'+(n-1),to=s.file+'.'+n;await fs.rm(to,{force:true});try{await fs.rename(from,to);}catch(e){if(e.code!=='ENOENT')throw e;}}
    s.fileSize=0;
  }
  function record(key,s,source,text,truncated=false){
    const event={projectKey:key,seq:++s.seq,time:clock(),source,text,persistenceError:s.persistenceError,...(truncated?{truncated:true}:{})};
    s.events.push(event);s.bytes+=sizeOf(event);
    // 同时限制事件对象数量和序列化容量，单字节输出不能撑大数组。
    while((s.bytes>maxBytes||s.events.length>MAX_EVENTS)&&s.events.length){s.bytes-=sizeOf(s.events.shift());s.lostPrefix=true;}
    for(const listener of s.listeners)try{listener(event);}catch{/* 查看者不影响采集。 */}
  }
  function warning(key,s,message){
    if(s.persistenceError)return;s.persistenceError=message;
    record(key,s,'system','\n[启动器] '+message+'\n');
  }
  function append(key,source,input){
    const s=get(key);if(!s||s.closed||!input)return;
    const clean=stripVTControlCharacters(input),text=tailUtf8(clean,maxBytes);if(!text)return;
    const bytes=Buffer.from(text);let offset=0,first=true;
    // 每个实时事件足够小；大型输出仍由多个连续序号传输。
    while(offset<bytes.length){let end=Math.min(offset+CHUNK_BYTES,bytes.length);while(end<bytes.length&&(bytes[end]&0xc0)===0x80)end--;
      record(key,s,source,bytes.subarray(offset,end).toString('utf8'),first&&text!==clean);offset=end;first=false;
    }
    if(text!==clean)s.lostPrefix=true;
    if(!s.persistenceError){
      const amount=Buffer.byteLength(clean);
      if(s.pendingBytes+amount>maxBytes){warning(key,s,'日志写入积压，部分文件输出已省略；实时日志仍可查看');return;}
      s.pendingBytes+=amount;
      s.queue=s.queue.then(async()=>{
        const output=Buffer.from(clean);let cursor=0;
        while(cursor<output.length){
          if(s.fileSize>=fileBytes)await rotate(s);
          let length=Math.min(output.length-cursor,fileBytes-s.fileSize);
          while(length>0&&cursor+length<output.length&&(output[cursor+length]&0xc0)===0x80)length--;
          if(!length){await rotate(s);continue;}
          await fs.appendFile(s.file,output.subarray(cursor,cursor+length));s.fileSize+=length;cursor+=length;
        }
      }).catch(()=>warning(key,s,'日志文件写入失败；实时日志仍可查看')).finally(()=>{s.pendingBytes-=amount;});
    }
  }
  return {
    async open(key,dir){
      const existing=get(key);if(existing&&!existing.closed)return existing.file;
      const s={file:path.join(dir,'logs/springboot-launcher.log'),fileSize:0,seq:existing?.seq||0,events:existing?.events||[],bytes:existing?.bytes||0,listeners:existing?.listeners||new Set(),lostPrefix:existing?.lostPrefix||false,closed:false,decoders:{stdout:new StringDecoder('utf8'),stderr:new StringDecoder('utf8')},queue:Promise.resolve(),pendingBytes:0,persistenceError:null};stores.set(key,s);
      try{await fs.mkdir(path.dirname(s.file),{recursive:true});s.fileSize=(await fs.stat(s.file).catch(()=>({size:0}))).size;if(s.fileSize>fileBytes)await rotate(s);}catch{s.persistenceError='无法创建日志文件；实时日志仍可查看';}
      return s.file;
    },
    appendChunk(key,source,bytes){const s=get(key);if(s)append(key,source,source==='system'?Buffer.from(bytes).toString('utf8'):s.decoders[source].write(bytes));},
    finishStream(key,source){const s=get(key);if(s?.decoders[source])append(key,source,s.decoders[source].end());},
    snapshot(key,{after=0,lines=100,maxBytes:cap=LIMITS.mcpBytes}={}){
      const s=get(key),base={events:[],lastSeq:s?.seq||0,gap:false,text:'',truncated:false,persistenceError:s?.persistenceError||null};if(!s)return base;
      const candidates=s.events.filter(e=>e.seq>after),raw=candidates.map(e=>e.text).join(''),parts=raw.split('\n');
      let remaining=Buffer.byteLength(parts.length>lines?parts.slice(-lines).join('\n'):raw);
      let budget=Math.min(cap,maxBytes)-sizeOf(base);const events=[];
      // text 与 events 都算进 JSON 字节上限，防止重连快照大于可发送帧。
      for(let i=candidates.length-1;i>=0&&remaining>0;i--){
        const event=candidates[i];let part=tailUtf8(event.text,remaining);const overhead=sizeOf({...event,text:''})+(events.length?1:0),available=budget-overhead;
        if(available<=0)break;
        const escaped=value=>sizeOf(value)-2;
        if(2*escaped(part)>available){let low=0,high=Buffer.byteLength(part);while(low<high){const mid=Math.ceil((low+high)/2);if(2*escaped(tailUtf8(part,mid))<=available)low=mid;else high=mid-1;}part=tailUtf8(part,low);}
        if(!part)break;
        events.unshift({...event,text:part});budget-=overhead+2*escaped(part);remaining-=Buffer.byteLength(part);
        if(part!==event.text)break;
      }
      const text=events.map(e=>e.text).join(''),truncated=text!==raw;
      return {...base,events,text,truncated,gap:truncated||after<s.seq&&(!s.events.length||(s.events[0]?.seq||0)>after+1||s.lostPrefix&&after<(s.events[0]?.seq||0))};
    },
    subscribe(key,listener){const s=get(key);if(!s)return ()=>{};s.listeners.add(listener);return ()=>s.listeners.delete(listener);},
    async flush(key){await get(key)?.queue;},
    async close(key){const s=get(key);if(!s||s.closed)return;this.finishStream(key,'stdout');this.finishStream(key,'stderr');s.closed=true;await s.queue;}
  };
}
