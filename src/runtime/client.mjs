import {failure,LauncherError} from '../core/errors.mjs';
import {validateConnection} from './instance.mjs';
export function createBackendClient(connection){
  validateConnection(connection);
  async function post(route,args={}){
    try{const response=await fetch(connection.origin+route,{method:'POST',headers:{Authorization:`Bearer ${connection.token}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000),redirect:'error'});return await response.json();}
    catch{return failure(new LauncherError('BACKEND_UNAVAILABLE','无法连接本机后台，请重新连接客户端'));}
  }
  return {invoke:(name,args)=>post(`/api/tools/${name}`,args),dashboard:()=>post('/api/ticket'),shutdown:options=>post('/api/shutdown',options),confirmOrphan:(dir,options)=>post('/api/orphan/forget',{dir,...options})};
}
