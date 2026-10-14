const encoder=new TextEncoder(),decoder=new TextDecoder(),MAX_EVENTS=2000;
export function trimText(value,maxBytes){const bytes=encoder.encode(value);if(bytes.length<=maxBytes)return value;let start=Math.max(0,bytes.length-maxBytes);while(start<bytes.length&&(bytes[start]&0xc0)===0x80)start++;return decoder.decode(bytes.subarray(start));}
export function createViewState({maxBytes=524288}={}){return {projectKey:null,maxBytes,logs:[],text:'',textBytes:0,logBytes:0,displayText:'',ranges:[],displayRanges:[],receivedSeq:0,runStartSeq:0,gap:false,gapDismissed:false,dismissedHints:[],paused:false,persistenceError:null};}
export function reduceEvent(state,event){
  if(event.type==='project')return {...createViewState({maxBytes:state.maxBytes}),projectKey:event.projectKey};
  if(event.type==='pause')return {...state,paused:true};
  if(event.type==='resume')return {...state,paused:false,displayText:state.text,displayRanges:state.ranges};
  if(event.type==='gap')return {...state,gap:true};
  if(event.type==='dismiss-gap')return {...state,gapDismissed:true};
  if(event.type==='dismiss-hint')return {...state,dismissedHints:[...new Set([...state.dismissedHints,event.hint])]};
  if(event.type==='restore-hint')return {...state,dismissedHints:state.dismissedHints.filter(hint=>hint!==event.hint)};
  if(['snapshot','log'].includes(event.type)){
    const data=event.data;
    if(state.projectKey&&data.projectKey&&data.projectKey!==state.projectKey)return state;
    if(Number.isSafeInteger(data.runStartSeq)&&data.runStartSeq>0){
      if(data.runStartSeq<state.runStartSeq)return state;
      // 重启事件来自任意客户端，不能只在点击本页面按钮时清除旧日志和缺口。
      if(data.runStartSeq>state.runStartSeq)state={...createViewState({maxBytes:state.maxBytes}),projectKey:state.projectKey,paused:state.paused,runStartSeq:data.runStartSeq,receivedSeq:data.runStartSeq-1};
    }
  }
  if(event.type==='snapshot'){
    let next={...state,gap:!!(state.gap||event.data.gap||event.data.truncated)};
    for(const item of event.data.events||[])next=reduceEvent(next,{type:'log',data:item});
    return {...next,receivedSeq:Math.max(next.receivedSeq,event.data.lastSeq||0),persistenceError:Object.hasOwn(event.data,'persistenceError')?event.data.persistenceError:next.persistenceError};
  }
  if(event.type!=='log'||event.data.seq<=state.receivedSeq)return state;
  const item=event.data;if(state.projectKey&&item.projectKey!==state.projectKey)return state;
  const itemBytes=encoder.encode(item.text).length,combined=state.text+item.text;
  let textBytes=state.textBytes+itemBytes,text=combined;
  if(textBytes>state.maxBytes){text=trimText(combined,state.maxBytes);textBytes=encoder.encode(text).length;}
  const removed=combined.length-text.length;
  const ranges=[...state.ranges,...(item.style?[{start:state.text.length,end:combined.length,style:item.style}]:[])].map(r=>({...r,start:Math.max(0,r.start-removed),end:r.end-removed})).filter(r=>r.end>0).slice(-MAX_EVENTS);
  const logs=[...state.logs,{...item,byteSize:itemBytes}];let logBytes=state.logBytes+itemBytes;
  while((logBytes>state.maxBytes||logs.length>MAX_EVENTS)&&logs.length){logBytes-=logs.shift().byteSize;}
  return {...state,logs,logBytes,text,textBytes,ranges,displayRanges:state.paused?state.displayRanges:ranges,displayText:state.paused?state.displayText:text,receivedSeq:item.seq,persistenceError:Object.hasOwn(item,'persistenceError')?item.persistenceError:state.persistenceError,gap:state.gap||!!item.truncated||item.seq>state.receivedSeq+1||text!==combined};
}
