import {t} from './i18n.mjs';
export function setupAppUpdates({request,notice}){
  const $=id=>document.getElementById(id);let info=null,release=null,checking=false,opened=false;
  function render(){
    $('app-version-text').textContent=info?`v${info.version}`:t('版本');
    $('app-update-badge').hidden=!release?.available;
    $('installed-version').textContent=info?.version||t('正在读取…');
    $('latest-version').textContent=release?.latestVersion||t('尚未检查');
    $('check-app-update').disabled=checking;
    $('update-status').textContent=checking?t('正在检查新版本…'):release?.state==='unavailable'?t('暂时无法连接更新源，请稍后重试。'):release?.state==='unpublished'?t('当前仓库尚未发布正式发行版。'):release?.available&&!release.installable?t('新版本已发布，安装包尚未准备好，请稍后重试。'):release?.available?t('发现新版本 {0}，可打开升级向导。',release.latestVersion):release?.state==='checked'?t('当前已是最新版本。'):t('更新来自本项目的 GitHub 正式发行版。');
    $('update-notes').textContent=release?.notes||'';$('update-notes').hidden=!release?.notes;
    $('update-mode').textContent=info?.managed?t('升级将保留项目、分组和日志。运行中的服务需要先停止。'):t('当前从源码目录运行。安装向导会创建独立安装，不会覆盖这里的代码。');
    $('open-app-installer').disabled=!info?.installerAvailable||opened;
    $('open-app-installer').textContent=info?.managed?t('打开升级向导'):t('打开安装向导');
    $('app-shortcut').disabled=!info?.installerAvailable;
  }
  async function check(force){
    if(checking)return;checking=true;render();
    try{release=await request('/api/app/check-update',{force});}
    catch{release={state:'unavailable'};}
    finally{checking=false;render();}
  }
  $('app-version').addEventListener('click',()=>{$('app-update-dialog').showModal();render();if(!release)void check(false);});
  $('close-app-update').addEventListener('click',()=>$('app-update-dialog').close());
  $('check-app-update').addEventListener('click',()=>void check(true));
  $('app-shortcut').addEventListener('click',async()=>{
    $('app-shortcut').disabled=true;
    try{await request('/api/app/create-shortcut',{});notice(t('桌面入口已创建，双击即可打开服务管理面板。'),true);}
    catch(error){notice(error.message);}
    finally{render();}
  });
  $('open-app-installer').addEventListener('click',async()=>{
    opened=true;render();
    try{await request('/api/app/open-installer',{});notice(t('安装向导已打开，请在窗口中选择安装目录和接入方式。'),true);}
    catch(error){notice(error.message);}
    finally{opened=false;render();}
  });
  return {render,async load(){if(info)return;try{info=await request('/api/app/info');render();void check(false);}catch{/* 认证或旧版后台错误由主页面处理，不影响日志。 */}}};
}
