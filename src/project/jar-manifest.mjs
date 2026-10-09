import {open} from 'node:fs/promises';
import {inflateRawSync} from 'node:zlib';
import {fail} from '../core/errors.mjs';
// 有界读取中央目录和 manifest；不会把 jar 解压或执行。
export async function readManifest(file) {
  const handle=await open(file,'r');
  const read=async(length,offset)=>{const b=Buffer.alloc(length);const r=await handle.read(b,0,length,offset);if(r.bytesRead!==length)fail('BUILD_REQUIRED','jar 元数据不完整');return b;};
  try{
    const size=(await handle.stat()).size;if(size<22)fail('BUILD_REQUIRED','jar 格式无效');
    const tail=await read(Math.min(size,65557),Math.max(0,size-65557));let end=-1;
    for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50&&i+22+tail.readUInt16LE(i+20)===tail.length){end=i;break;}
    if(end<0)fail('BUILD_REQUIRED','找不到 jar 中央目录');
    const length=tail.readUInt32LE(end+12),offset=tail.readUInt32LE(end+16);
    if(length>8388608||offset+length>size)fail('UNSUPPORTED_PROJECT','jar 中央目录过大或使用不支持的 ZIP64');
    const central=await read(length,offset);let entry=null;
    for(let i=0;i<central.length;){
      if(i+46>central.length||central.readUInt32LE(i)!==0x02014b50)fail('BUILD_REQUIRED','jar 中央目录无效');
      const n=central.readUInt16LE(i+28),extra=central.readUInt16LE(i+30),comment=central.readUInt16LE(i+32);
      if(i+46+n+extra+comment>central.length)fail('BUILD_REQUIRED','jar 条目不完整');
      if(central.subarray(i+46,i+46+n).toString()==='META-INF/MANIFEST.MF')entry={method:central.readUInt16LE(i+10),packed:central.readUInt32LE(i+20),unpacked:central.readUInt32LE(i+24),offset:central.readUInt32LE(i+42),flags:central.readUInt16LE(i+8)};
      i+=46+n+extra+comment;
    }
    if(!entry)return {};
    if(entry.flags&1||entry.packed>65536||entry.unpacked>65536)fail('UNSUPPORTED_PROJECT','jar manifest 加密或超过大小限制');
    const local=await read(30,entry.offset);if(local.readUInt32LE(0)!==0x04034b50)fail('BUILD_REQUIRED','jar 本地条目无效');
    const start=entry.offset+30+local.readUInt16LE(26)+local.readUInt16LE(28);
    const bytes=await read(entry.packed,start);
    const data=entry.method===0?bytes:entry.method===8?inflateRawSync(bytes,{maxOutputLength:65536}):null;
    if(!data)fail('UNSUPPORTED_PROJECT','jar 压缩格式不支持');
    const attrs={};for(const line of data.toString('utf8').replace(/\r?\n /g,'').split(/\r?\n/)){const split=line.indexOf(':');if(split>0)attrs[line.slice(0,split)]=line.slice(split+1).trim();}
    return {mainClass:attrs['Main-Class']||null,startClass:attrs['Start-Class']||null,classPath:(attrs['Class-Path']||'').split(/\s+/).filter(Boolean)};
  }catch(error){if(error.code?.startsWith('ERR_'))fail('BUILD_REQUIRED','jar 元数据读取失败');throw error;}
  finally{await handle.close();}
}
