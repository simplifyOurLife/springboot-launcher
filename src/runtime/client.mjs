import {failure,LauncherError} from '../core/errors.mjs';
import {validateConnection,verifyConnection} from './instance.mjs';
export function createBackendClient(connection){
  validateConnection(connection);
  async function post(route,args={}){
    try{const response=await fetch(connection.origin+route,{method:'POST',headers:{Authorization:`Bearer ${connection.token}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000),redirect:'error'});return await response.json();}
    catch{return failure(new LauncherError('BACKEND_UNAVAILABLE','无法连接本机后台，请重新连接客户端'));}
  }
  async function shutdown(options){
    const result=await post('/api/shutdown',options);
    if(!result.ok)return result;
    // 退出响应先于后台清理完成；安装切换须等待旧实例真正关闭，避免复用退出中的后台。
    const until=Date.now()+10000;
    while(await verifyConnection(connection)){
      if(Date.now()>=until)return failure(new LauncherError('BACKEND_UNAVAILABLE','后台退出尚未完成，请稍后重试'));
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    return result;
  }
  return {invoke:(name,args)=>post(`/api/tools/${name}`,args),dashboard:()=>post('/api/ticket'),shutdown,confirmOrphan:(dir,options)=>post('/api/orphan/forget',{dir,...options})};
}
