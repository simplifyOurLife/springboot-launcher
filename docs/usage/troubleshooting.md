# 故障排查

| 提示或现象 | 处理 |
| --- | --- |
| BUILD_REQUIRED | 自行构建可信工程。核对 jar／classes 与源码时间、运行依赖、入口类及兄弟模块产物，再重试。不会自动下载依赖或执行 Maven。 |
| AMBIGUOUS_ARTIFACT／AMBIGUOUS_MAIN_CLASS | 明确指定 jarPath 或 mainClass；选择实际可运行的应用模块。 |
| JDK_NOT_FOUND／JDK_VERSION_MISMATCH | 指定目标工程要求的 jdkHome；客户端进程的环境可能与终端不同。 |
| PORT_IN_USE | 换端口或自行处理占用程序。启动器不会按端口杀进程。 |
| 进程运行中，就绪未确认 | 查看日志；TCP 开放不等于应用健康。没有可识别启动完成证据时保持未确认。 |
| START_FAILED／快速退出 | 查看面板 stderr 和退出码，检查 JDK、Profile、依赖和应用配置。 |
| 面板访问失效或 401 | 重新执行 dashboard 或调用面板工具，用新单次链接打开；不要保存旧链接。 |
| 两个客户端看不到同一服务 | 比较当前 Windows 用户和 SPRINGBOOT_LAUNCHER_HOME，使用同一目录。 |
| PRIVATE_DIRECTORY_FAILED | 使用支持 Windows ACL 的本地磁盘空目录；核对当前用户权限。不要放宽认证或改为公网访问。 |
| BACKEND_UNAVAILABLE 且旧后台还在 | 先核对现有后台状态，不要删除锁强行创建第二份后台。 |
| SERVICE_RUNNING | 先停止服务；明确要停止全部时才使用 daemon stop --stop-services。 |
| ORPHANED_SERVICE | 人工检查并处理旧进程，确认服务不再运行后，按下述命令遗忘记录。禁止依旧 PID 盲目终止。 |
| 日志缺口／写盘失败 | 内存和磁盘都有容量上限，面板会提示缺口；检查项目 logs 写权限。 |

人工处理后台异常后的遗留服务后，可确认遗忘该项目的旧记录：

```powershell
node .\bin\springboot-launcher.mjs daemon forget --dir "D:\demo\orders-service" --confirm-orphan
```

不要将此命令当作停止进程。它仅删除恢复记录；必须先确认旧服务已被人工处理。提交问题前脱敏路径、日志、配置和截图，不要附上后台实例文件、票据或 Cookie。
