# 1.0.1 发布检查

本版定位为 Windows 本机 Maven Spring Boot 服务管理工具，提供共享 Node 后台、MCP 接口、CLI 和网页面板。1.0.1 不扩展到远程管理、Gradle 或其他操作系统。

发布入口：[版本说明](releases/1.0.1.md) · [安装与升级](usage/installation.md) · [本次验证记录](verification/release-1.0.1.md) · [发布步骤](maintainers/github-release.md)。

## 已准备

- [x] package.json、锁文件及 CLI／MCP／面板共用版本统一为 1.0.1。
- [x] 默认英文 README、中文 README、官网、安装说明、许可证、来源和安全边界同步。
- [x] 独立面板入口、目录选择安装、桌面图标、稳定 MCP 路径与正式版本更新入口已实现。
- [x] 安装包白名单排除运行状态、凭据、业务日志、测试及临时文件；npm 使用官方源并按锁文件安装。
- [x] 独立审阅完成；已修复系统校时误清理保护记录、跨盘安装准备可能留下半成品的问题。
- [x] 本地定向 Node 验证、Windows PowerShell 5.1／PowerShell 7 隔离安装升级和实际 Shell 快捷方式验证通过。
- [x] 个人 Git 配置及全部待公开历史的 author／committer 邮箱为 qiyifeng <617060296@qq.com>。
- [x] 用户已授权检查后提交发布；1.0.1 用于修正 1.0.0 真实在线安装发现的问题。

## 发布顺序

1. 提交已审阅的源码与公开材料，推送 main。
2. 确认该提交的 [Windows 自动验证](https://github.com/simplifyOurLife/springboot-launcher/actions/workflows/test.yml) 通过；失败时修复，不创建发布标签。
3. 对同一已验证提交创建 v1.0.1 标签并推送。发行工作流再次检查版本一致及同 SHA 的 CI 成功后发布 ZIP、SHA-256 和安装入口。
4. 验证 [Release](https://github.com/simplifyOurLife/springboot-launcher/releases/tag/v1.0.1)、[官网](https://simplifyOurLife.github.io/springboot-launcher/)、在线下载及隔离真实安装，记录实际结果；不移动已公开标签。

## 发布结果（2026-10-14）

1.0.0 与 1.0.1 标签均已公开，未移动历史标签。1.0.1 的同提交 Windows CI、发行工作流和官网部署通过，正式下载、全新隔离安装及从 1.0.0 升级验证通过；推荐安装 1.0.1。详见[实际验证记录](verification/release-1.0.1.md)。

## 验收边界

本机服务已由使用者实际体验并反馈修复；自动验证不替代所有项目布局和运行环境验收。复杂 Maven Profile／插件、不同企业代理、无 Node 的全新 Windows 环境和真实 Codex／Claude Code 自动注册及交叉操作仍需分别验证。保留[人工验收表](verification/alpha-acceptance.md)，未执行项不勾选。

安装器没有代码签名；仓库仍保持 private:true，不发布 npm 公共包。GitHub 私密漏洞报告入口未核验，不宣称已开放。上述支持范围和限制必须随 Release 保留。
