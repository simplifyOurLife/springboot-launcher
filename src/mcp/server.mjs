import {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {failure} from '../core/errors.mjs';
const string=z.string().min(1).max(4096),dir={dir:string};
const tools={
  spring_boot_discover:{title:'发现 Spring Boot 项目',description:'只读扫描指定根目录中的 Maven 应用模块，返回截断提示。',shape:{root:string,depth:z.number().int().min(0).max(10).optional(),maxDirs:z.number().int().min(1).max(2000).optional(),timeoutMs:z.number().int().min(1).max(5000).optional()},readOnly:true},
  spring_boot_inspect:{title:'检查运行条件',description:'只读检查 Maven 应用模块、已有产物、Profile 默认值与来源，以及本机 JDK 候选和兼容版本推荐。',shape:dir,readOnly:true},
  spring_boot_start:{title:'启动服务',description:'启动可信 Maven 工程；缺少或过期产物时自动编译并准备运行依赖，日志持续可查。默认离线，mvnOffline:false 允许下载依赖；noBuild:true 禁止自动准备。',shape:{...dir,profile:string.optional(),port:z.number().int().min(1).max(65535).optional(),jdkHome:string.optional(),mode:z.enum(['auto','jar','classpath']).optional(),jarPath:string.optional(),mainClass:string.optional(),classpath:z.array(string).min(1).max(2000).optional(),jvmArgs:z.array(string).min(1).max(128).optional(),healthUrl:string.optional(),noBuild:z.boolean().optional(),mvnOffline:z.boolean().optional()}},
  spring_boot_status:{title:'查看服务状态',description:'查询同一个共享后台中的单个或全部服务，运行不等于就绪。',shape:{dir:string.optional()},readOnly:true},
  spring_boot_logs:{title:'读取日志片段',description:'只读返回默认 100 行、最多 1000 行及 256 KiB 的日志；片段会进入当前 AI 会话。',shape:{...dir,lines:z.number().int().min(1).max(1000).optional(),after:z.number().int().min(0).optional()},readOnly:true},
  spring_boot_stop:{title:'停止服务',description:'终止当前后台托管的 JVM。Windows 不承诺执行优雅关闭钩子，不按端口或旧 PID 终止其他进程。',shape:dir,destructive:true},
  spring_boot_restart:{title:'重启服务',description:'先停止托管进程，成功后按原配置重新检查、必要时准备 Maven 产物再启动；停止失败则取消。',shape:dir,destructive:true},
  spring_boot_dashboard:{title:'打开实时日志面板',description:'返回本机网页面板的 60 秒单次访问链接，在 Codex 浏览器面板或系统浏览器打开。',shape:{}}
};
export function createMcpServer({client}){
  const server=new McpServer({name:'springboot-launcher',version:'0.1.0'},{instructions:'先检查用户指定的可信 Maven Spring Boot 项目。启动可能自动执行该工程的 Maven 编译、插件和依赖准备；只对用户已授权启动的可信项目调用，noBuild:true 可禁止准备，默认离线。Codex、Claude Code 和网页共用当前用户后台，聊天结束不会停止服务。实时日志在网页显示；主动请求日志会把片段送入当前 AI 会话。工具注解不是执行授权。'});
  for(const [name,tool]of Object.entries(tools))server.registerTool(name,{title:tool.title,description:tool.description,inputSchema:z.object(tool.shape).strict(),annotations:{readOnlyHint:!!tool.readOnly,destructiveHint:!!tool.destructive,idempotentHint:!!tool.readOnly,openWorldHint:false}},async args=>{
    let result;try{result=await client.invoke(name,args);}catch(error){result=failure(error);}
    return {isError:!result.ok,structuredContent:result,content:[{type:'text',text:JSON.stringify(result)}]};
  });
  return server;
}
