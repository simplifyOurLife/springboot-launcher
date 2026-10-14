// 消息固定悬浮，不参与布局。悬停或键盘聚焦时暂停自动关闭。
export function createToast(node,text,close){
  let timer=null,remaining=0,started=0,hovered=false,focused=false;
  const stop=()=>{clearTimeout(timer);timer=null;};
  const hide=()=>{stop();node.hidden=true;};
  const resume=()=>{if(hovered||focused||node.hidden)return;started=Date.now();timer=setTimeout(hide,remaining);};
  const pause=()=>{if(timer){remaining=Math.max(0,remaining-(Date.now()-started));stop();}};
  node.addEventListener('mouseenter',()=>{hovered=true;pause();});node.addEventListener('mouseleave',()=>{hovered=false;resume();});
  node.addEventListener('focusin',()=>{focused=true;pause();});node.addEventListener('focusout',event=>{if(!node.contains(event.relatedTarget)){focused=false;resume();}});
  close.addEventListener('click',hide);
  return {show(message,success=false){stop();text.textContent=message;node.classList.toggle('success',success);node.hidden=false;remaining=success?4000:8000;resume();},hide,dispose:stop};
}
