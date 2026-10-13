// 只解释 SGR 颜色和字重；OSC、光标控制等序列直接丢弃，跨数据块保存解析状态。
const palette=['#202428','#e06c75','#98c379','#e5c07b','#61afef','#c678dd','#56b6c2','#d1d9d5','#89948e','#ff8790','#b3df91','#ffe09b','#88caff','#dda5ff','#88dce5','#ffffff'];
function color(n){return n<16?palette[n]:n<232?'#'+[Math.floor((n-16)/36),Math.floor((n-16)/6)%6,(n-16)%6].map(v=>(v?55+40*v:0).toString(16).padStart(2,'0')).join(''):'#'+(8+(n-232)*10).toString(16).padStart(2,'0').repeat(3);}
export function createAnsiDecoder(){
  let mode='text',sequence='',style={};
  function sgr(raw){
    const codes=(raw||'0').split(';').map(Number);
    for(let i=0;i<codes.length;i++){
      const n=codes[i];
      if(n===0)style={};
      else if(n===1)style.bold=true;
      else if(n===22)delete style.bold;
      else if(n===3)style.italic=true;
      else if(n===23)delete style.italic;
      else if(n===4)style.underline=true;
      else if(n===24)delete style.underline;
      else if(n===39)delete style.fg;
      else if(n===49)delete style.bg;
      else if(n>=30&&n<=37)style.fg=color(n-30);
      else if(n>=90&&n<=97)style.fg=color(n-90+8);
      else if(n>=40&&n<=47)style.bg=color(n-40);
      else if(n>=100&&n<=107)style.bg=color(n-100+8);
      else if(n===38||n===48){
        const field=n===38?'fg':'bg',kind=codes[++i];
        if(kind===5){const value=codes[++i];if(Number.isInteger(value)&&value>=0&&value<=255)style[field]=color(value);}
        else if(kind===2){const rgb=codes.slice(i+1,i+4);i+=3;if(rgb.length===3&&rgb.every(v=>Number.isInteger(v)&&v>=0&&v<=255))style[field]='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');}
      }
    }
  }
  return {write(input){
    const runs=[];let text='';
    const flush=()=>{if(text){runs.push({text,...(Object.keys(style).length?{style:{...style}}:{})});text='';}};
    for(const ch of input){
      if(mode==='text'){
        if(ch==='\x1b'){flush();mode='escape';}
        else if(ch==='\x9b'){flush();mode='csi';sequence='';}
        else if(ch==='\x9d'){flush();mode='osc';}
        else if(ch==='\n'||ch==='\r'||ch==='\t'||ch.charCodeAt(0)>=32&&!(ch.charCodeAt(0)>=127&&ch.charCodeAt(0)<=159))text+=ch;
      }else if(mode==='escape'){
        if(ch==='['){mode='csi';sequence='';}
        else if(ch===']')mode='osc';
        else if(['P','^','_'].includes(ch))mode='string';
        else mode='text';
      }else if(mode==='csi'){
        if(ch>='@'&&ch<='~'){if(ch==='m'&&/^[\d;]*$/.test(sequence))sgr(sequence);mode='text';sequence='';}
        else if(sequence.length<128)sequence+=ch;
        else mode='discard-csi';
      }else if(mode==='discard-csi'){if(ch>='@'&&ch<='~')mode='text';}
      else if(mode==='osc'||mode==='string'){if(ch==='\x07'||ch==='\x9c')mode='text';else if(ch==='\x1b')mode='string-end';}
      else if(mode==='string-end'){mode=ch==='\\'?'text':'string';}
    }
    flush();return runs;
  }};
}
