const encoder=new TextEncoder(),decoder=new TextDecoder();
export function trimText(value,maxBytes){const bytes=encoder.encode(value);if(bytes.length<=maxBytes)return value;let start=bytes.length-maxBytes;while(start<bytes.length&&(bytes[start]&0xc0)===0x80)start++;return decoder.decode(bytes.subarray(start));}
export function createViewState({maxBytes=524288}={}){return {projectKey:null,maxBytes,logs:[],text:'',displayText:'',receivedSeq:0,gap:false,paused:false};}
export function reduceEvent(state,event){
  if(event.type==='project')return {...createViewState({maxBytes:state.maxBytes}),projectKey:event.projectKey};
  if(event.type==='pause')return {...state,paused:true};
  if(event.type==='resume')return {...state,paused:false,displayText:state.text};
  if(event.type==='gap')return {...state,gap:true};
  if(event.type==='snapshot'){
    let next={...state,gap:state.gap||event.data.gap};for(const item of event.data.events||[])next=reduceEvent(next,{type:'log',data:item});return {...next,receivedSeq:Math.max(next.receivedSeq,event.data.lastSeq||0)};
  }
  if(event.type!=='log'||event.data.seq<=state.receivedSeq)return state;
  const item=event.data;if(state.projectKey&&item.projectKey!==state.projectKey)return state;
  const combined=state.text+item.text,text=trimText(combined,state.maxBytes),logs=[...state.logs,item];let bytes=logs.reduce((n,e)=>n+encoder.encode(e.text).length,0);
  while(bytes>state.maxBytes&&logs.length){bytes-=encoder.encode(logs.shift().text).length;}
  return {...state,logs,text,displayText:state.paused?state.displayText:text,receivedSeq:item.seq,gap:state.gap||item.seq>state.receivedSeq+1||text!==combined};
}
