# Codex 接入

先按 [README](../../README.md) 在启动器目录安装依赖。下例中的 `D:\tools\springboot-launcher` 请替换为源码实际绝对路径，`node` 需要在 Codex 启动环境的 PATH 中。

```powershell
codex mcp add springboot-launcher -- node "D:\tools\springboot-launcher\bin\springboot-launcher.mjs" mcp
```

这是供使用者自行执行的配置命令，本项目的安装和测试不会修改现有 Codex 配置。命令结构已用本机 Codex CLI 帮助核对；尚未在真实 Codex 会话完成业务工程验收。官方语法见 [Codex MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。

重新打开客户端或会话，在 MCP 列表确认连接及以下八个工具：`spring_boot_discover`、`spring_boot_inspect`、`spring_boot_start`、`spring_boot_status`、`spring_boot_logs`、`spring_boot_stop`、`spring_boot_restart`、`spring_boot_dashboard`。CLI 会话可以使用 `/mcp` 查看连接。

可以告诉 Codex：

> 请检查 D:\demo\orders-service 的 Spring Boot 运行条件，以 local Profile 和 8087 端口启动，缺少或过期产物时自动准备 Maven 编译及依赖。打开实时日志面板。

普通启动会在需要时准备 Maven 产物，日志可在面板实时查看，准备期间可以停止或重启。默认先离线；未显式设置 `mvnOffline` 且检测到明确的离线缓存缺失时，自动联网重试一次。MCP 可用 `mvnOffline:true` 固定离线、`mvnOffline:false` 直接允许联网。只想运行已有产物时设置 `noBuild:true`，此时缺少产物返回 `BUILD_REQUIRED`。准备失败显示 `BUILD_FAILED`，应先查看日志。JDK 选择不正确时指定 `jdkHome`。其他启动参数包括 `dir`、`profile`、`port`、`mode`、`jarPath`、`mainClass`、`classpath`（字符串数组）、`jvmArgs`（字符串数组）、`healthUrl`；未知字段会被拒绝。

`port` 不填时保留 Spring 配置优先级，不追加端口覆盖，面板会显示未指定端口。需要提前检查端口冲突时明确填写端口。可选 `healthUrl` 例如 `http://127.0.0.1:8087/actuator/health`，只支持无凭据的本机 HTTP 地址；启用后持续依据健康接口判断，DOWN、401、超时不会被启动日志覆盖为健康。

面板工具返回短期本机链接。Codex 桌面版可在浏览器面板打开，CLI 用户可用系统浏览器打开。固定专用侧栏插件不属于首版。链接过期请重新调用工具，不要复制后台控制凭据。

如果为两个客户端自定义 `SPRINGBOOT_LAUNCHER_HOME`，必须设置为同一个绝对空目录；默认都使用当前用户 LOCALAPPDATA，无需额外设置。客户端环境可能不同，排查时比较 Node、JDK 和后台目录。移除 MCP 配置只移除代理，不会停止 JVM；先通过工具或面板停止不再需要的服务。
