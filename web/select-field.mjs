// 保留 select 作为配置值与事件的唯一来源，浮层只负责显示和键盘交互。
const fields = new Set();
let opened = null;
export function refreshSelectFields() {for (const field of fields) field.sync();}
export function setupSelectFields() {
  for (const select of document.querySelectorAll('select')) {
    if(select.dataset.enhanced)return;
    select.dataset.enhanced = 'true';select.hidden = true;
    const trigger = document.createElement('button');trigger.type = 'button';trigger.className = 'select-trigger';
    trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
    const value = document.createElement('span');value.className = 'select-value';
    const arrow = document.createElement('span');arrow.className='select-chevron';arrow.setAttribute('aria-hidden','true');
    trigger.append(value,arrow);select.after(trigger);
    const popup=document.createElement('div');popup.className='select-popup';popup.id=`${select.id}-options`;popup.setAttribute('role','listbox');popup.hidden=true;
    trigger.setAttribute('aria-controls',popup.id);document.body.append(popup);
    let active=-1, prefix='', prefixTimer;
    const options=()=>Array.from(select.options);
    const content=(node,option)=>{
      node.replaceChildren();
      const text=document.createElement('span');text.className='select-label-text';text.textContent=option?.textContent||'';node.append(text);
      if(option?.dataset.badge){const tag=document.createElement('span');tag.className='select-option-tag';tag.textContent=option.dataset.badge;node.append(tag);}
    };
    const label=()=>select.getAttribute('aria-label') || Array.from(select.labels?.[0]?.childNodes || []).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).join(' ') || select.id;
    const position=()=>{
      const rect=trigger.getBoundingClientRect(), below=innerHeight-rect.bottom-12, above=rect.top-12;
      const up=below<180&&above>below;
      popup.style.maxHeight=`${Math.max(60,Math.min(320,up?above:below))}px`;
      popup.style.width=`${Math.min(innerWidth-24,Math.max(rect.width,select.id==='language'?160:280))}px`;
      popup.style.left=`${Math.max(12,Math.min(rect.left,innerWidth-popup.getBoundingClientRect().width-12))}px`;
      popup.style.top=`${up?Math.max(12,rect.top-popup.getBoundingClientRect().height-5):rect.bottom+5}px`;
    };
    const highlight=(index,scroll=true)=>{
      active=index;
      Array.from(popup.children).forEach((node,i)=>node.classList.toggle('is-active',i===active));
      const node=popup.children[active];
      if(node){trigger.setAttribute('aria-activedescendant',node.id);if(scroll)node.scrollIntoView({block:'nearest'});}
      else trigger.removeAttribute('aria-activedescendant');
    };
    const close=()=>{popup.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');if(opened===field)opened=null;clearTimeout(prefixTimer);prefix='';};
    const choose=index=>{
      const option=options()[index];if(!option||option.disabled||select.disabled)return;
      select.value=option.value;close();
      select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));refreshSelectFields();
    };
    const render=()=>{
      popup.replaceChildren();
      options().forEach((option,index)=>{
        const node=document.createElement('div');node.id=`${popup.id}-${index}`;node.className='select-option';node.setAttribute('role','option');node.setAttribute('aria-selected',String(option.selected));node.setAttribute('aria-disabled',String(option.disabled));
        const text=document.createElement('span');text.className='select-option-label';content(text,option);
        const check=document.createElement('span');check.className='select-check';check.textContent=option.selected?'✓':'';check.setAttribute('aria-hidden','true');node.append(text,check);
        node.addEventListener('pointerdown',event=>event.preventDefault());
        node.addEventListener('pointermove',()=>{if(!option.disabled)highlight(index,false);});
        node.addEventListener('click',()=>choose(index));popup.append(node);
      });
      highlight(active,false);
    };
    const sync=()=>{
      const selected=select.selectedOptions[0];content(value,selected);trigger.title=[selected?.textContent,selected?.dataset.badge].filter(Boolean).join(' · ');
      trigger.disabled=select.disabled;trigger.setAttribute('aria-label',label());popup.setAttribute('aria-label',label());
      if(select.disabled)close();
      if(!popup.hidden){render();position();}
    };
    const open=()=>{
      if(select.disabled)return;
      opened?.close();opened=field;active=select.selectedIndex;
      if(options()[active]?.disabled)active=options().findIndex(option=>!option.disabled);
      render();popup.hidden=false;trigger.setAttribute('aria-expanded','true');position();highlight(active);
    };
    const field={sync,close,trigger,popup};fields.add(field);
    trigger.addEventListener('click',()=>popup.hidden?open():close());
    trigger.addEventListener('keydown',event=>{
      if(event.key==='Escape'){if(!popup.hidden){event.preventDefault();event.stopPropagation();close();}return;}
      if(event.key==='Tab'){close();return;}
      if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
        event.preventDefault();if(popup.hidden){open();return;}
        if(event.key==='Enter'||event.key===' '){choose(active);return;}
        const enabled=options().map((option,i)=>option.disabled?-1:i).filter(i=>i>=0);
        const offset=enabled.indexOf(active),next=event.key==='Home'?enabled[0]:event.key==='End'?enabled.at(-1):enabled[Math.max(0,Math.min(enabled.length-1,offset+(event.key==='ArrowDown'?1:-1)))];
        highlight(next??-1);return;
      }
      if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
        event.preventDefault();if(popup.hidden)open();clearTimeout(prefixTimer);prefix+=event.key.toLocaleLowerCase();
        const match=options().findIndex(option=>!option.disabled&&option.textContent.trim().toLocaleLowerCase().startsWith(prefix));
        if(match>=0)highlight(match);prefixTimer=setTimeout(()=>{prefix='';},700);
      }
    });
    trigger.addEventListener('blur',close);
    select.addEventListener('input',sync);select.addEventListener('change',sync);
    new MutationObserver(sync).observe(select,{childList:true,subtree:true,characterData:true,attributes:true});sync();
  }
  new MutationObserver(refreshSelectFields).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  document.addEventListener('pointerdown',event=>{if(opened&&!opened.trigger.contains(event.target)&&!opened.popup.contains(event.target))opened.close();});
  window.addEventListener('resize',()=>opened?.close());
  document.addEventListener('scroll',event=>{if(opened&&!opened.popup.contains(event.target))opened.close();},true);
}
