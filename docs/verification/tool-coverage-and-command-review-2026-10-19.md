# MCP 工具测试与子进程调用复核

## 工具测试覆盖

外部评估的 4/8 与原先测试中显式出现的工具名称一致：MCP 测试调用 start、status、stop，HTTP 测试另有 inspect。这是工具名称／入口覆盖统计，不能等同于整个工程只有 50% 的代码覆盖率。原先列举八个工具的断言也不能证明八个工具均可调用。

现已扩展 `tests/mcp.test.mjs`，通过真实 stdio MCP 客户端、共享 HTTP 后台和受控 Node 模拟服务，分别验证以下工具：

| 工具 | 验证结果或副作用 |
| --- | --- |
| spring_boot_discover | 返回指定夹具中的可启动项目，未截断 |
| spring_boot_inspect | 返回真实入口类、Java 版本要求和夹具 jar 路径 |
| spring_boot_start | 创建受控模拟进程并返回 PID |
| spring_boot_status | 另一代理读取到同一 PID 和运行状态 |
| spring_boot_logs | 读取模拟进程的中文 stdout、stderr 和对应日志来源 |
| spring_boot_dashboard | 返回当前后台的面板链接，票据兑换成功且不能重复使用 |
| spring_boot_restart | 替换旧 PID，保持项目标识，并能从另一代理读到新 PID |
| spring_boot_stop | 一个代理退出后，另一代理仍能停止服务并确认 PID 已清空 |

工具枚举的期望值使用独立的八个字面名称；各调用均有结果或副作用断言，没有仅靠添加工具名称凑齐统计。8/8 代表工具调用入口均被覆盖，不代表所有参数与异常分支均被覆盖。

## 两处进程调用

### src/project/jdk.mjs

`exec` 是 `promisify(execFile)` 的本地别名，调用时显式指定 `shell:false`，以独立参数 `['-version']` 执行选定的 Java 可执行文件，没有把工程路径拼接成 shell 命令。扫描候选 JDK 时只读 release 元数据；实际解析启动 JDK 才执行版本探测，并有限时和输出大小限制。

这里不能将“存在子进程”直接认定为“通过 shell 执行用户命令”。[Node.js 对 execFile 的说明](https://nodejs.org/docs/latest-v22.x/api/child_process.html#child_processexecfilefile-args-options-callback)区分了直接执行文件和启动 shell。参数应保持数组形式，不额外添加用于 shell 字符串的引号或转义。

新增 Windows 行为测试使用包含 `& echo openjdk version 99.0.1 & rem` 的有效目录名，以及不可执行的 java.exe 夹具，要求返回 JDK_NOT_FOUND。另在一次性内存模块副本中仅将 shell:false 改成 shell:true，确认 echo 会伪造 Java 99，新增断言可捕获此回归；生产文件没有被改成不安全实现。

### src/runtime/private-dir.mjs

此处确实启动 PowerShell，但通过 execFile、shell:false 和固定的 `-File scripts/private-dir.ps1` 执行受控脚本，目录只作为 `-Directory` 数据参数传入。没有拼接 `-Command`、cmd /c 或 Invoke-Expression。脚本使用 LiteralPath 读取目录及标记，再用 Windows ACL API 设置并核验当前用户 SID、所有者、访问规则和继承限制。[Microsoft 对 -File 参数的说明](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_powershell_exe?view=powershell-5.1#-file----filepath-args)可用于核对这种调用方式。

Node 的 chmod 不能替代该实现所需的 Windows SID 与 ACL 核验，因此保留固定辅助脚本。新增实际目录测试覆盖空格、方括号、&、分号与 $()；首次初始化和再次核验均须处理原样路径。

这两处没有发现评估所担心的命令字符串拼接问题；该结论只针对列出的两处调用，不替代整个工程的安全审计。

## 本次验证

```powershell
node --test --test-concurrency=1 tests/mcp.test.mjs tests/private-home.test.mjs tests/project.test.mjs
```

首次受限环境执行出现三项 ACL 脚本超时及一项目录联接 EPERM；在普通本机 Windows 环境运行相同命令，26 项全部通过，未跳过用例、未放宽断言，也未调整生产超时。测试使用独立临时目录和模拟 Node 服务，不操作真实业务服务，没有执行 Java、Maven 或前端构建。本次未运行全量回归，未发布新版本。
