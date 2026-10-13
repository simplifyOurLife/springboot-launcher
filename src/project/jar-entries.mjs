import {open} from 'node:fs/promises';

// 只读取有界 ZIP 中央目录以确认类是否存在，不解压、不加载或执行 jar。
export async function findJarEntries(file,names){
  const handle=await open(file,'r');
  const read=async(length,offset)=>{
    const data=Buffer.alloc(length),result=await handle.read(data,0,length,offset);
    if(result.bytesRead!==length)throw new Error('jar 目录读取不完整');
    return data;
  };
  try{
    const size=(await handle.stat()).size;
    if(size<22)throw new Error('jar 格式无效');
    const tail=await read(Math.min(size,65557),Math.max(0,size-65557));let end=-1;
    for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50&&i+22+tail.readUInt16LE(i+20)===tail.length){end=i;break;}
    if(end<0)throw new Error('jar 缺少中央目录');
    const length=tail.readUInt32LE(end+12),offset=tail.readUInt32LE(end+16);
    if(length>8388608||offset+length>size||tail.readUInt16LE(end+10)===65535)throw new Error('jar 目录超过检查范围');
    const directory=await read(length,offset),wanted=new Set(names),found=[];
    for(let i=0;i<directory.length;){
      if(i+46>directory.length||directory.readUInt32LE(i)!==0x02014b50)throw new Error('jar 中央目录无效');
      const n=directory.readUInt16LE(i+28),next=i+46+n+directory.readUInt16LE(i+30)+directory.readUInt16LE(i+32);
      if(next>directory.length)throw new Error('jar 目录条目不完整');
      const name=directory.subarray(i+46,i+46+n).toString('utf8');
      if(wanted.has(name))found.push(name);
      i=next;
    }
    return found;
  }finally{await handle.close();}
}
