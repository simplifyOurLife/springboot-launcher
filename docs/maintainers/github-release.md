# GitHub 版本发布

仓库为 [simplifyOurLife/springboot-launcher](https://github.com/simplifyOurLife/springboot-launcher)，默认分支 main。当前发布版本为 1.0.0；公开操作需维护者授权，本次使用者已授权检查通过后推送。

## 提交前

1. 阅读[发布检查](../release-readiness.md)、[版本说明](../releases/1.0.0.md)、安全策略和第三方来源。公开截图仅使用模拟项目与日志。
2. 使用 git config --show-origin 核对有效身份，个人项目采用 qiyifeng <617060296@qq.com>。检查全部待发布分支及标签的 author／committer，不能仅改当前配置。
3. 检查源码差异、未跟踪文件、常见密钥和公司路径。明确列出暂存文件，不提交 .superpowers、本机状态、票据、业务日志或真实项目截图。
4. 核对 package.json、package-lock.json 和 docs/releases/对应版本.md；npm 官方源和依赖完整性保持一致。
5. 执行受影响流程的定向验证及 npm pack --dry-run --json --ignore-scripts，检查发行白名单。不要自动构建真实 Java 工程。

## 推送与 Release

先提交并推送 main，查看 Windows 自动验证。CI 通过后，给同一提交创建与 package.json 一致的 v1.0.0 标签。标签触发 .github/workflows/release.yml，工作流核对同 SHA 的 Windows CI 成功才创建 Release。

发行资产包括 springboot-launcher-v1.0.0-windows.zip、checksums.txt、install.ps1 和 install.cmd。官网仅发布 site 目录；其安装引导从最新正式 Release 下载。公开网页不连接本机服务后台。

发布后在隔离目录和独立 SPRINGBOOT_LAUNCHER_HOME 验证真实下载、SHA-256、npm 准备、稳定入口及面板；不要覆盖维护者现有安装、快捷方式或 MCP 配置。将实际结果追加到[本次验证记录](../verification/release-1.0.0.md)。

标签公开后不静默移动。代码修复采用新版本；只有补充验证结论时，可以另推文档提交并更新 Release 说明。

## 私密漏洞报告

维护者可在仓库 Settings → Advanced Security → Private vulnerability reporting 启用私密报告，再从 Security → Advisories 核验 Report a vulnerability 入口。未经核验时保留 SECURITY.md 的未核验说明；不要将可利用细节或凭据放进公开 Issue。参考 [GitHub 官方步骤](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)。
