# GitHub 首次发布步骤

本文件供维护者执行首次源码公开和基础版本发布。当前没有 GitHub 远端、Release、版本标签或已启用的私密漏洞报告入口。文档准备不代表已经授权或完成这些云端操作。

## 发布内容

建议仓库短描述：**供 Codex、Claude Code 和网页共用的本地 Spring Boot 启动器，支持服务启停与实时日志。**

建议主题词：`spring-boot`、`mcp`、`codex`、`claude-code`、`java`、`windows`、`developer-tools`。最终仓库名称、所属账号与公开操作由维护者确认。

首次按基础版本源码发布，沿用 package.json 的 `0.1.0`，保留 `private:true` 避免误发 npm。GitHub 源码公开不要求同时发布 npm 包或客户端市场插件。

## 本地收尾

1. 审阅 README、[发布说明草稿](../releases/0.1.0.md)、许可证、第三方说明及[安全策略](../../SECURITY.md)；确认支持范围和待验收项准确。
2. 按[简短验收表](../verification/alpha-acceptance.md)记录真实结果。未完成时，发布说明继续明确 当前支持范围和已知限制，不将自动或模拟证据改写为实机通过。
3. 审阅 `git diff`、新文件和公开图片；仅提交源码、脱敏示例和公开材料。不要使用未核对的 `git add .`，不要提交 `.superpowers`、本机状态、票据、业务日志或真实项目截图。
4. 核对锁文件来源。项目 .npmrc 和 package-lock.json 已统一为 npm 官方源，依赖版本与完整性保持不变。安装验证结果见[发布清单](../release-readiness.md)。
5. 执行 `npm pack --dry-run --json --ignore-scripts` 检查发行内容；这是清单检查，不执行 Java 或前端 build。拟附源码包时核对 README 所引用材料均存在。
6. 将本地改动整理成审阅过的提交，记录要发布的 SHA。此文档不代替提交内容审核。

## 仓库与安全入口

创建或关联实际仓库后，配置 README 中的仓库地址，并在公开发布材料里使用真实 URL；没有确定账号前不要放看似可用的占位链接。

GitHub 公共仓库的拥有者或管理员可在 **Settings → Advanced Security → Private vulnerability reporting → Enable** 启用私密报告。启用后，仓库 **Security → Advisories** 应出现 **Report a vulnerability** 入口。步骤依据 [GitHub 官方文档](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)。

维护者应确认可以接收该仓库的安全通知；随后在 SECURITY.md 写入实际报告入口，并从研究者视角核对可见性。报告入口路径形如 `https://github.com/OWNER/REPOSITORY/security/advisories/new`，这里的 OWNER／REPOSITORY 仅说明结构，不是可用地址。

如果云端入口暂未启用，保持“尚未配置”的说明，先提供经确认可用的私密联系方式。不要填写虚构邮箱，不要求报告者将利用细节发到公开 Issue。

## 推送与基础版本 Release

仓库创建、关联远端、推送和发布仍需维护者明确决定。执行时核对实际账号、仓库、可见性、分支和提交，保留 Apache-2.0 与来源说明。

首次推送后检查 `.github/workflows/test.yml` 的 Windows CI 结果，失败时先判断原因，不把本地历史结果当成云端通过。确认仓库许可证识别、README 图片、Issue／PR 模板和安全入口正常。

发布 Release 时使用已核对提交，版本标签使用 `v0.1.0`，与 package.json 的版本对应，按首个基础版本发布，并以[基础版本发布说明草稿](../releases/0.1.0.md)为正文基础。草稿的“尚未发布”段落应替换成实际状态；正文可用 README、接入说明和安全策略的真实仓库链接。没有准备并验证独立安装程序时，不将其列为附件。

将仓库 URL、提交 SHA、标签、CI 链接、安全入口和验收结论回填[发布清单](../release-readiness.md)。标签一旦公开，不要为修改源码静默移动；后续修复采用新版本。
