# 参与贡献

本项目当前为本地 alpha MVP，欢迎提供可公开的最小 Maven Spring Boot 示例、问题复现或文档改进。真实业务工程与双客户端验收仍待执行。

## 项目范围

首版聚焦 Windows 上的 Maven Spring Boot 启动、双客户端共用后台和实时日志。新增平台、构建工具或远程管理能力应先单独讨论，不应扩大现有支持承诺。

修改前请阅读 [MVP 设计](docs/superpowers/specs/2026-10-09-shared-springboot-launcher-design.md) 及 [工程规范](docs/commons/rules/engineering.md)。

## 提交问题

请提供受影响版本或提交、系统与客户端版本、JDK／Maven 信息、脱敏后的运行配置、最小复现步骤、预期与实际结果。

可以提供公开的最小目录结构和 POM 片段。不要提交真实业务仓库、完整 application 配置、访问凭据、内部域名或未经检查的日志。安全问题按 [安全策略](SECURITY.md) 处理。

## 开发与验证

- 使用当前文档列明的 Windows、PowerShell 和 Node.js 基线。
- 保持后台唯一性，所有界面与 MCP 操作共用一组服务生命周期逻辑。
- 注释、关键日志、文档、提交信息和 PR 描述优先使用中文。
- 子进程使用可执行文件及参数数组，避免拼接 shell 命令。
- 自动测试使用隔离临时目录、假子进程和本地接口，不运行 Java 或前端 build。
- 真实工程需要构建时，由使用者执行；没有完成真实验证就如实标注。
- 行为修改应增加能够捕获实际问题的测试，纯文档或低影响样式修改无需增加镜像测试。

安装使用 `npm ci --ignore-scripts --no-audit --no-fund`，测试使用 `npm test`，发行内容检查使用 `npm pack --dry-run --json --ignore-scripts`。测试在仓库忽略目录 `.superpowers/tmp` 中创建夹具，包括目录联接、私有 ACL、回环接口和模拟子进程，需要相应本地权限。不会启动真实 Java 或执行业务 build。结果见[验证映射](documentation/tests.md)。

## 提交与 PR

提交信息简洁说明结果，例如“修复：避免两个客户端重复启动同一项目”。PR 说明触发条件、变更行为、验证证据及实际限制，遵循仓库模板。

移植外部代码时保留许可证和版权，注明来源及修改；依赖变更需同步锁文件与 [第三方来源说明](THIRD_PARTY_NOTICES.md)。不要在公开材料中承诺尚未存在的功能。
