# 验证映射

实际命令、结果和未验收项见[验证记录](../docs/verification/mvp.md)，不能把模拟进程测试视作真实 Java 或实际客户端验收。

| 覆盖 | 测试文件 | 实际边界 |
| --- | --- | --- |
| 项目扫描、POM、JDK、已有产物、陈旧依赖、参数数组 | tests/project.test.mjs | 隔离夹具和注入 JDK 版本探测 |
| UTF-8、ANSI、缓冲、轮转、磁盘失败 | tests/log-store.test.mjs | 真实测试目录文件 |
| 并发、托管启停、快速退出、端口冲突、遗留记录 | tests/services.test.mjs | 真实 Node 模拟子进程，无 Java |
| 认证、Host、跨站、票据、会话、请求限制、SSE | tests/backend.test.mjs | 真实回环 HTTP |
| 双进程唯一后台、存活锁、私有目录 | tests/runtime.test.mjs | Windows ACL 和进程 |
| 双代理 SDK 协商、状态共享、代理退出 | tests/mcp.test.mjs | legacy／auto SDK 客户端，不是 Codex／CC 实机 |
| CLI、确认参数和帮助 | tests/cli.test.mjs | 不改用户配置 |
| 序号、快照、缺口、暂停和容量 | tests/web-state.test.mjs | 纯状态测试；另有实际浏览器模拟验证 |
| 发行包白名单与敏感文件排除 | tests/package.test.mjs | npm pack dry-run，不公开发布 |

Windows 工作流已配置，但云端尚未执行，也未设置分支强制检查。真实 Maven 项目布局、Java 启停、目标机 ACL、实际 Codex／CC 交叉使用，按验收步骤由使用者验证。
