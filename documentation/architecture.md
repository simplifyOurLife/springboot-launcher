# 架构与交付索引

当前版本 1.0.0，面向 Windows 本机 Maven Spring Boot 开发；复杂构建与真实双客户端交叉操作的验收边界见发布材料。证据见[验证记录](../docs/verification/mvp.md)。

| 组件 | 实现与职责 | 边界 |
| --- | --- | --- |
| MCP 代理 | src/mcp，官方 SDK STDIO，八个工具 | 每会话一个代理，不拥有 JVM |
| 唯一后台 | src/runtime、src/backend，实例发现、认证、HTTP／SSE | 当前用户共享，回环监听 |
| 项目与服务 | src/project、src/services，检查与进程生命周期 | 需要时自动准备 Maven 产物，项目操作互斥，准备过程可停止 |
| 日志 | src/logs，有界 UTF-8 内存、磁盘轮转 | 查看者断开不停止采集 |
| 网页面板 | web，静态 HTML／CSS／JS | 与 MCP 共用后台，无前端 build |
| 工作区分组 | src/backend/workspace.mjs，项目导入记录、逻辑文件夹与原子保存 | 同用户私有目录，不移动工程文件；SSE 同步面板 |
| 系统目录选择 | src/backend/folder-picker.mjs、scripts/select-project-folder.ps1 | Windows STA 目录窗口，固定脚本和参数数组；只检查所选项目，不启动服务 |
| 私有目录 | scripts/private-dir.ps1，核验当前用户 ACL | 需要支持 ACL 的本地磁盘 |

后台生成长期控制凭据，代理从私有文件读取；网页用 60 秒单次票据交换 8 小时会话。后台启动通过 `src/runtime/service-recovery.mjs` 清理已退出或能确认系统已重启的服务登记；存活或无法核实的旧进程仍标为 orphaned，不自动接管或终止。清理结果先持久化，再开放面板，不删除项目和日志。Windows 不保证 JVM 优雅关闭。应用以当前用户权限运行，无应用沙箱。

没有数据库、邮件、业务定时任务、公共网页、内嵌 LLM 或遥测。主动 MCP 日志查询会把片段带入当前 AI 会话。

## 关联文档

[设计](../docs/superpowers/specs/2026-10-09-shared-springboot-launcher-design.md) · [实施计划](../docs/superpowers/plans/2026-10-09-shared-springboot-launcher-mvp.md) · [流程](flows.md) · [权限](permissions.md) · [配置](variables.md) · [测试](tests.md) · [工程规范](../docs/commons/rules/engineering.md) · [安全策略](../SECURITY.md) · [贡献指南](../CONTRIBUTING.md) · [第三方来源](../THIRD_PARTY_NOTICES.md) · [发布检查](../docs/release-readiness.md)。

[基础版本发布说明](../docs/releases/0.1.0.md) · [真实验收表](../docs/verification/alpha-acceptance.md) · [后续修复证据](../docs/verification/alpha-followups.md) · [GitHub 发布步骤](../docs/maintainers/github-release.md)。

ANSI 由 `src/logs/ansi.mjs` 在后台逐流增量解析；日志事件可携带受限 style 字段，text 与轮转文件仍为纯文本。样式元数据计入事件和快照容量。前端文本与样式范围一起裁剪、暂停与检索；Spring 启动标志按流保留 4096 字符尾部识别，避免颜色分段丢失就绪证据。后台认证 Cookie 名称按凭据摘要区分实例，多个本机后台可以共存。

`spring_boot_inspect` 同时供 MCP 和面板获取 Profile 元数据与本机 JDK 候选。`src/project/profiles.mjs` 只读标准本地 application 配置，限制为 100 个文件、单文件 128 KiB、总计 1 MiB；YAML 限制别名、层级与字段，不返回配置原文或加载远程引用。不能完整复现 Spring 运行时的外部配置来源，自动识别结果不额外覆盖启动参数，实际 Profile 可由 Spring 启动日志校正。

`src/project/jdk.mjs` 沿用 DSH 候选发现并补齐来源、同级多版本目录与兼容推荐，扫描只读 `release` 和项目版本提示。用户选定路径通过原生参数启动 Java，真正启动前继续执行有限时的版本验证；不修改机器环境变量。

服务发现和检查共用 `main-classes.mjs`，基础库不能因为继承 Boot 就成为服务。`reactor.mjs` 展开有界模块树并求声明依赖闭包；POM 按 XML 层级区分实际 dependencies 与 dependencyManagement。classpath 资源目录与字节码分别校验，增量编译按对应源码核对，内部 jar 通过类路径排除而非删除。自动模式只优先新鲜 jar，旧 jar 可退回新鲜 classes。

导入请求携带随机 requestId，SSE 的 import-progress 事件只供对应页面显示进度，不带工程配置原文。导入、检查与生成启动计划保持只读；普通启动捕获 BUILD_REQUIRED 后由 `build-instructions.mjs` 生成结构化 Maven 参数，在后台托管准备进程。默认离线，noBuild 可禁止准备。准备阶段返回 starting／phase=preparing，项目锁不等待整次编译，停止可中断准备；成功后重新检查产物，失败转 failed／BUILD_FAILED 并保留日志。Windows 固定 PowerShell 脚本通过 UTF-8 JSON 标准输入接收参数，拒绝 CMD 元字符；停止只针对当前活子进程终止 Maven 进程树。Maven XML 读取不等于 effective POM，构建 Profile 和复杂插件布局仍需工程验收。

未显式设置 mvnOffline 且识别到离线缓存缺失时，Maven 准备可自动联网重试一次；显式固定离线不会切换。未就绪的首次 Java 缺类退出可触发一次依赖准备，已准备后不循环修复。Maven 失败时也会重新检查新鲜 classes，只有产物可用且未识别到编译错误才降级直接启动，不能保证覆盖全部 Maven 错误格式。

后台启动时只读检查旧工作区工程并保存经确认的非应用记录清理结果；运行中及 orphaned 服务受保护，检查失败保留记录。静态页面在后台启动时读入内存，与该次后台接口配套；升级不热替换后台，需先停止服务后重新打开。页面折叠只改变布局，不重建 SSE 或持久化布局状态。
