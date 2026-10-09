# MVP 验证记录

版本：0.1.0-alpha.1；日期：2026-10-09。本记录区分自动测试、模拟浏览器验证和真实工程验收。

## 已执行

- Windows 11、PowerShell 7、Node.js 22.22.2、npm 10.9.7。
- 任务 1–7：`npm test`，36／36 通过，包括双后台连接进程、SDK legacy／auto 双 STDIO 代理共享服务与 Windows 私有 ACL。
- 实际浏览器操作隔离模拟项目：添加／检查、启动、重启、停止、暂停／恢复、搜索、复制、刷新恢复、430px 窄页面。包含中文和 HTML 的日志按纯文本显示。
- 修复浏览器验证发现的首条启动事件缺失和运行未就绪提示错误，回归测试先失败再通过。
- [面板截图](../assets/mvp-panel-demo.jpg) 只包含模拟数据，不表示真实 Java 验收。

- 执行 `npm ci --ignore-scripts --no-audit --no-fund`，锁定安装 14 个依赖成功。发行白名单测试先因缺少 files 失败，补齐后 `npm test` 37／37 通过；测试实际执行 npm pack dry-run。
- CLI 帮助通过，不连接后台。干净目录、整版独立审阅及 Git 历史检查仍在进行，最终结果于交付补齐。

## 真实工程验收（待执行）

1. 使用可信 Maven Spring Boot 应用模块，手工准备已构建产物与依赖，记录 JDK 和 Spring Boot 版本。不要让启动器执行构建。
2. 按 [Codex](../usage/codex.md) 和 [CC](../usage/claude-code.md) 的说明自行配置同一个源码入口和后台目录。
3. Codex 检查并启动：指定应用模块绝对路径、local Profile、可用端口及必要 JDK。确认进程状态、日志、实际业务接口；网页打开并查看中文实时输出。
4. CC 查询同一项目，核对 PID、状态、日志，然后停止。确认业务端口关闭，网页显示退出信息。
5. 由 CC 启动，再由 Codex 查询并停止；退出一个聊天后确认服务继续运行。
6. 同项目并发启动确认只有一 JVM；用已占用端口确认只报冲突；修改源码后确认提示 BUILD_REQUIRED；重启前准备最新产物。
7. 在不含业务数据的测试项目验证后台异常遗留提示，先人工处理旧服务，再确认遗忘记录。不要按未经核对的旧 PID 终止进程。

结果：**待用户执行**。没有自动运行真实工程、没有修改现有客户端配置，也没有执行 Java／前端 build。

## 交付边界

首版支持范围为 Windows 本机 Maven Spring Boot，其他系统、Gradle、远程访问、固定插件侧栏、系统服务与后台异常后自动接管未验收。Windows 不保证优雅关闭 JVM。POM 解析面向常见本地结构，不执行 Maven effective-pom 或下载远端 parent。

GitHub 仓库创建、推送、版本发布、私密漏洞入口和云端 CI 均待后续处理；保留 package.json 的 private=true，避免误发布 npm。

## 实施决策

- 使用当前 main 工作树和 PowerShell 进度记录，遵循用户已确认选择；成本是无隔离分支，需要逐项提交回退。
- 测试目录放仓库忽略区，路径解析使用 callback realpath，绕过受限令牌下 native realpath 的 EPERM，并保留联接解析；成本是测试需要仓库写权限。
- 私有 ACL 已满足时严格复检，仅不满足时设置，避免普通用户重复设置需要额外 Windows 特权；成本是需要支持 ACL 的本地目录。
