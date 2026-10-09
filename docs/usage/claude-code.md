# Claude Code 接入

先按 [README](../../README.md) 安装依赖。在要使用的业务工程目录中执行以下命令，把示例路径替换成启动器源码实际位置：

```powershell
claude mcp add --transport stdio springboot-launcher -- node "D:\tools\springboot-launcher\bin\springboot-launcher.mjs" mcp
```

若希望当前用户的各工程都能使用，可由使用者自行增加 `--scope user`，放在服务名之前。默认范围和命令语法依据 [Claude Code MCP 官方文档](https://code.claude.com/docs/en/mcp)。本项目不会自动写入现有 Claude Code 配置；真实 CC 客户端交叉操作尚待验收。老版本客户端需要先核对自身帮助是否支持这些选项。

重新打开 Claude Code，使用 `/mcp` 检查连接。在与 Codex 相同 Windows 用户、相同 `SPRINGBOOT_LAUNCHER_HOME` 下，两个客户端自动连接同一后台。

可以告诉 CC：

> 查看 D:\demo\orders-service 的运行状态和最近 100 行日志，然后停止这个托管服务。

也可以由 CC 启动，再由 Codex 查询或停止。CC 终端的实时查看入口为同一个系统浏览器页面：调用 `spring_boot_dashboard`，打开返回的短期链接。关闭 CC 会话不停止 JVM。

MCP 使用原生 STDIO 代理，不需要为 CC 单独启动第二份后台，也不需要复制本机控制凭据。状态不一致时先检查两个客户端是否用了不同 Windows 用户或后台目录，见[故障排查](troubleshooting.md)。
