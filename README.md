# Spring Boot 启动器

让 Codex、Claude Code 和网页面板共用一套本地 Spring Boot 服务管理能力。

## 当前状态

MVP 书面设计已确认，目前等待[实施计划](docs/superpowers/plans/2026-10-09-shared-springboot-launcher-mvp.md) 审阅与执行方式确认。仓库已有设计和开源准备文档，产品代码、可执行入口、客户端安装步骤和自动测试尚未生成；没有发布 npm 包，也没有完成真实 Spring Boot 启停验收。

请先阅读 [MVP 设计](docs/superpowers/specs/2026-10-09-shared-springboot-launcher-design.md)。下面描述的是确定的产品方向，不能作为已经实现的功能清单。

## MVP 目标

- 本地唯一后台管理 Maven Spring Boot 项目、JDK、运行配置及 JVM。
- Codex 和 Claude Code 通过各自的 MCP 代理连接同一个后台。
- 网页面板操作项目并实时查看 stdout、stderr、运行状态和退出信息。
- 聊天结束不停止服务；重复启动、端口冲突和缺少产物有明确提示。
- 优先运行已准备的 jar 或 classes；需要构建时交给用户处理。

首版验收目标为 Windows 11、PowerShell 7 和 Maven Spring Boot。Gradle、Linux、macOS、公网访问、客户端固定侧栏及系统服务安装暂未进入支持范围。

## 使用方式

MVP 完成后会提供可验证的源码安装步骤，以及 Codex 和 Claude Code 的接入配置。当前不提供尚不存在的安装命令。

面板计划在 Codex 桌面版的浏览器面板或系统浏览器打开。CC 终端版使用同一个系统浏览器页面；后台和面板均运行在本机，无需部署到云端。

## 开源准备

- [架构、权限与验证文档](documentation/architecture.md)
- [参与贡献](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [行为准则](CODE_OF_CONDUCT.md)
- [第三方来源说明](THIRD_PARTY_NOTICES.md)
- [MVP 发布检查清单](docs/release-readiness.md)

仅在真实验收和发布检查通过后标记为可用 MVP。自动测试结果与真实客户端验证将分别记录，未验证的平台不会被宣传为已支持。

## 许可证与归属

本项目采用 [Apache License 2.0](LICENSE)。实现计划参考 DSH Spring Boot Launcher；复制来源及修改记录将保存在第三方来源说明中。

Codex、Claude Code、Spring Boot 和其他产品名称仅说明集成对象，本项目不是这些产品的官方项目，也不表示官方背书。
