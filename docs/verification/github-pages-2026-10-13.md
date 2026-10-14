# GitHub Pages 官网验证

官网源码位于 `site/`，纯静态发布，不需要 npm 安装或前端构建。网页介绍产品和接入方式，不调用本机后台。图片复用仓库中已公开的隔离示例截图。

## 0.2.0 截图更新

README 与官网预览已更新为当前 0.2.0 页面，使用公开示例路径、模拟 JDK 和 ANSI 日志。中英文工作台、日志专注视图分别提供对应语言的图片；官网图片 URL 带版本标记，避免沿用旧浏览器缓存。入口说明见[截图更新记录](screenshots-2026-10-13.md)。本次只修改本地资源，尚未推送或重新部署线上官网。

## 本地检查

- 在 `/springboot-launcher/` 子路径启动静态预览，页面与图片正常加载。
- 浏览器检查英文默认、中文切换、语言刷新后保留、完整工作台／专注日志预览、Codex／Claude Code 命令切换和复制成功反馈。
- 手机与平板宽度分别检查，页面没有水平溢出；调整中文手机首屏标题为两行。
- 控制台无错误。JavaScript 语法、静态资源路径、中英文键与 Git 空白检查通过。
- Claude Code 示例指定 `--scope user`，从启动器目录接入后可在当前用户的其他项目使用；页面明确说明范围。
- 未运行真实 Java、Maven、前端构建或本地全量回归。

## 发布方式

仓库 Pages 使用 GitHub Actions 发布，工作流只上传 `site/`。固定官方 action SHA，权限限定为源码读取及 Pages 部署，主分支推送官网变化后自动更新。

发布结果以 [Pages 工作流](https://github.com/simplifyOurLife/springboot-launcher/actions/workflows/pages.yml) 与 [线上页面](https://simplifyOurLife.github.io/springboot-launcher/) 为准。维护方式见 [官网维护说明](../maintainers/github-pages.md)。
