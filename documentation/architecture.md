# 架构与交付索引

当前已有本地 alpha 实现，真实客户端与业务工程验收待执行。证据见[验证记录](../docs/verification/mvp.md)。

| 组件 | 实现与职责 | 边界 |
| --- | --- | --- |
| MCP 代理 | src/mcp，官方 SDK STDIO，八个工具 | 每会话一个代理，不拥有 JVM |
| 唯一后台 | src/runtime、src/backend，实例发现、认证、HTTP／SSE | 当前用户共享，回环监听 |
| 项目与服务 | src/project、src/services，检查与进程生命周期 | 只运行已有产物，项目操作互斥 |
| 日志 | src/logs，有界 UTF-8 内存、磁盘轮转 | 查看者断开不停止采集 |
| 网页面板 | web，静态 HTML／CSS／JS | 与 MCP 共用后台，无前端 build |
| 私有目录 | scripts/private-dir.ps1，核验当前用户 ACL | 需要支持 ACL 的本地磁盘 |

后台生成长期控制凭据，代理从私有文件读取；网页用 60 秒单次票据交换 8 小时会话。后台重启不自动接管旧进程；异常记录需要人工确认。Windows 不保证 JVM 优雅关闭。应用以当前用户权限运行，无应用沙箱。

没有数据库、邮件、业务定时任务、公共网页、内嵌 LLM 或遥测。主动 MCP 日志查询会把片段带入当前 AI 会话。

## 关联文档

[设计](../docs/superpowers/specs/2026-10-09-shared-springboot-launcher-design.md) · [实施计划](../docs/superpowers/plans/2026-10-09-shared-springboot-launcher-mvp.md) · [流程](flows.md) · [权限](permissions.md) · [配置](variables.md) · [测试](tests.md) · [工程规范](../docs/commons/rules/engineering.md) · [安全策略](../SECURITY.md) · [贡献指南](../CONTRIBUTING.md) · [第三方来源](../THIRD_PARTY_NOTICES.md) · [发布检查](../docs/release-readiness.md)。
