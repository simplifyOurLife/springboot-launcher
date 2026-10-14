# 验证映射

实际命令、结果和未验收项见 [MVP 验证记录](../docs/verification/mvp.md)、[面板重构验证](../docs/verification/panel-2026-10-10.md)及[检索与分组验证](../docs/verification/panel-interactions-2026-10-10.md)，不能把模拟进程测试视作真实 Java 或实际客户端验收。

| 覆盖 | 测试文件 | 实际边界 |
| --- | --- | --- |
| 项目扫描、POM、JDK、已有产物、陈旧依赖、参数数组 | tests/project.test.mjs | 隔离夹具和注入 JDK 版本探测 |
| Profile 多格式、优先级、占位符、元数据脱敏、自动参数语义、JDK 发现与推荐 | tests/runtime-options.test.mjs | 隔离配置和伪 JDK 文件，不执行 Java；另有本机只读扫描与浏览器验证 |
| 薄 jar 资源、入口筛选、增量编译、assembly、嵌套传递依赖、准备指引、JDK 子进程环境 | tests/dsh-compatibility.test.mjs | 合成 class／jar、只读计划与注入执行器，不编译或运行 Java |
| ANSI 跨块、256 色／RGB、控制序列抑制、颜色范围裁剪、独立 Cookie | tests/ansi.test.mjs | 纯解析、状态和隔离日志测试 |
| UTF-8、ANSI、缓冲、轮转、磁盘失败 | tests/log-store.test.mjs | 真实测试目录文件 |
| 并发、托管启停、快速退出、端口冲突、遗留记录 | tests/services.test.mjs | 真实 Node 模拟子进程，无 Java |
| 自动准备、失败退出码、停止／重启与阶段间隙取消、noBuild、Wrapper、Windows 参数编码与进程树清理 | tests/automatic-preparation.test.mjs | Node／CMD 模拟 Maven 与 Java，不执行真实编译或下载依赖 |
| 首次缺类修复一次、业务错误不重建、离线缓存缺失联网一次 | tests/start-fallback.test.mjs | Node 模拟输出与注入计划，不证明真实 Maven 失败识别完整 |
| 非强制退出、超时强杀、停止期间尾部日志 | tests/stop-drain.test.mjs | 注入 taskkill／子进程事件，不运行 JVM |
| 认证、Host、跨站、票据、会话、请求限制、SSE、显示模块、CSP、旧工作区非应用校正 | tests/backend.test.mjs | 真实回环 HTTP；校正用例注入检查结果，保护运行和不可访问项目 |
| 双进程唯一后台、存活锁、私有目录 | tests/runtime.test.mjs | Windows ACL 和进程 |
| 双代理 SDK 协商、状态共享、代理退出 | tests/mcp.test.mjs | legacy／auto SDK 客户端，不是 Codex／CC 实机 |
| CLI、确认参数和帮助 | tests/cli.test.mjs | 不改用户配置 |
| 序号、快照、缺口、暂停和容量 | tests/web-state.test.mjs | 纯状态测试；另有实际浏览器模拟验证 |
| 连续上下文、全缓冲检索、多处循环导航、高亮数量限制、原文分段、运行时长、可用操作 | tests/presentation.test.mjs | 纯显示逻辑；DOM 安全与交互另经实际浏览器验证 |
| 分组恢复、并发保存、失败回滚、参数校验、目录选择协议 | tests/workspace.test.mjs | 隔离文件；注入目录选择进程，不实际操作系统对话框 |
| 发行包白名单与敏感文件排除 | tests/package.test.mjs | npm pack dry-run，不公开发布 |
| 整版审阅边界回归 | tests/regressions.test.mjs | 旧锁交错、跨后台遗留保护、日志重连/订阅/容量、健康 URL、Profile、多模块顺序 |

Windows CI 已有实际运行记录；1.0.0 必须在同一提交验证成功后再发布，结果见[发布验证](../docs/verification/release-1.0.0.md)。尚未设置分支强制检查。真实 Maven 项目布局、目标机 ACL、实际 Codex／CC 交叉使用，按验收步骤由使用者验证。

1.0.0 新增覆盖包括 tests/service-recovery.test.mjs（已退出记录、系统运行时长回退、校时保护与未知进程）、tests/updates.test.mjs 与 tests/update-api.test.mjs（来源、缓存及认证边界）、tests/installer-flow.ps1（隔离安装升级与同盘准备）和 tests/shortcut-flow.ps1（实际 Shell 图标与入口）。

本轮服务行、拖拽、彩色日志与认证引导的实际浏览器验证见[服务管理验证](../docs/verification/panel-service-rows-2026-10-10.md)。

Profile／JDK 自动识别、选择保留和紧凑布局见[运行环境验证](../docs/verification/panel-runtime-options-2026-10-10.md)。

真实项目反馈的根因分析、只读诊断和导入进度验证见[dsh 兼容性记录](../docs/verification/dsh-compatibility-2026-10-10.md)。

最近修复的实际检查见[后续修复证据](../docs/verification/alpha-followups.md)。停止即时提示的真实 Java 操作、缺类后的真实 Maven 修复、单模块与嵌套 reactor 自动准备、实际双客户端交叉使用仍需按[简短验收表](../docs/verification/alpha-acceptance.md)执行。它们是待验证项，不能据模拟用例标为通过。
