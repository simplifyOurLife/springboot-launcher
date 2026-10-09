import {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {failure} from '../core/errors.mjs';
const string=z.string().min(1).max(4096),dir={dir:string};
const tools={
  spring_boot_discover:{title:'发现 Spring Boot 项目',description:'只读扫描指定根目录中的 Maven 应用模块，返回截断提示。',shape:{root:string,depth:z.number().int().min(0).max(10).optional(),maxDirs:z.number().int().min(1).max(2000).optional(),timeoutMs:z.number().int().min(1).max(5000).optional()},readOnly:true},
  spring_boot_inspect:{title:'检查运行条件',description:'只读检查 Maven 应用模块、已有产物、JDK 要求和运行配置。',shape:dir,readOnly:true},
  spring_boot_start:{title:'启动服务',description:'启动可信工程的已有 jar 或 classes；产物缺失或过期时返回 BUILD_REQUIRED，不执行构建。',shape:{...dir,profile:string.optional(),port:z.number().int().min(1).max(65535).optional(),jdkHome:string.optional(),mode:z.enum(['auto','jar','classpath']).optional(),jarPath:string.optional(),mainClass:string.optional(),classpath:z.array(string).min(1).max(2000).optional(),jvmArgs:z.array(string).min(1).max(128).optional(),healthUrl:string.optional()}},
  spring_boot_status:{title:'查看服务状态',description:'查询同一个共享后台中的单个或全部服务，运行不等于就绪。',shape:{dir:string.optional()},readOnly:true},
  spring_boot_logs:{title:'读取日志片段',description:'只读返回默认 100 行、最多 1000 行及 256 KiB 的日志；片段会进入当前 AI 会话。',shape:{...dir,lines:z.number().int().min(1).max(1000).optional(),after:z.number().int().min(0).optional()},readOnly:true},
  spring_boot_stop:{title:'停止服务',description:'终止当前后台托管的 JVM。Windows 不承诺执行优雅关闭钩子，不按端口或旧 PID 终止其他进程。',shape:dir,destructive:true},
  spring_boot_restart:{title:'重启服务',description:'先停止托管 JVM，停止成功后重新检查已有运行产物并启动；停止失败则取消。',shape:dir,destructive:true},
  spring_boot_dashboard:{title:'打开实时日志面板',description:'返回本机网页面板的 60 秒单次访问链接，在 Codex 浏览器面板或系统浏览器打开。',shape:{}}
};
export function createMcpServer({client}){
  const server=new McpServer({name:'springboot-launcher',version:'0.1.0-alpha.1'},{instructions:'先检查用户指定的可信 Maven Spring Boot 项目，再启动已有产物。不能自动执行 Java 或前端构建。Codex、Claude Code 和网页共用当前用户后台，聊天结束不会停止服务。实时日志在网页显示；主动请求日志会把片段送入当前 AI 会话。工具注解不是执行授权。'});
  for(const [name,tool]of Object.entries(tools))server.registerTool(name,{title:tool.title,description:tool.description,inputSchema:z.object(tool.shape).strict(),annotations:{readOnlyHint:!!tool.readOnly,destructiveHint:!!tool.destructive,idempotentHint:!!tool.readOnly,openWorldHint:false}},async args=>{
    let result;try{result=await client.invoke(name,args);}catch(error){result=failure(error);}
    return {isError:!result.ok,structuredContent:result,content:[{type:'text',text:JSON.stringify(result)}]};
  });
  return server;
}
