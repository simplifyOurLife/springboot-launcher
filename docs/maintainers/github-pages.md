# GitHub Pages 官网维护

官网地址：<https://simplifyOurLife.github.io/springboot-launcher/>。

## 官网与本机面板

`site/` 是公开的产品介绍和入门网站，采用 HTML、CSS、JavaScript 与静态图片，直接发布到 GitHub Pages，不需要安装 npm 依赖或运行构建。

`web/` 是本机服务管理面板，依赖本机 Node 后台、会话认证以及用户电脑上的 Java 工程。它继续通过 CLI、Codex 或 Claude Code 打开；GitHub Pages 不运行这些后台能力。官网只介绍产品、展示示例界面和提供安装说明，不连接访客电脑上的服务。

## 首次启用

在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。不需要创建 `gh-pages` 分支，也不需要配置自定义域名。[GitHub 发布来源说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

拥有仓库管理权限、且已登录 GitHub CLI 时，也可以使用 API 配置。先查询当前设置：

```powershell
gh api repos/simplifyOurLife/springboot-launcher/pages
```

仅在确认 Pages 尚未启用（返回 404）时创建：

```powershell
gh api --method POST repos/simplifyOurLife/springboot-launcher/pages -f build_type=workflow
```

如果已经启用但发布来源不同，则更新现有设置：

```powershell
gh api --method PUT repos/simplifyOurLife/springboot-launcher/pages -f build_type=workflow
```

创建或更新设置需要仓库管理员、维护者或相应 Pages 管理权限；细粒度令牌需要仓库的 Pages 写权限与 Administration 写权限。这是首次配置权限，日常工作流使用 GitHub 自动提供的令牌，不需要保存个人令牌到仓库。[GitHub Pages API 文档](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site)

## 日常发布

修改 `site/` 中的内容后推送到 `main`，`.github/workflows/pages.yml` 会上传该目录并发布。修改工作流本身也会触发部署；仅修改后台或其他文档不会触发官网部署。

需要重新部署时，可在 **Actions → GitHub Pages → Run workflow** 选择 `main`，或执行：

```powershell
gh workflow run pages.yml --repo simplifyOurLife/springboot-launcher --ref main
```

工作流只允许 `main` 发布，部署环境为 `github-pages`，并发发布会排队。可以在部署环境中进一步限制仅 `main` 分支可发布。工作流固定使用官方 action 的完整提交 SHA，更新版本时应同时核对来源并更新版本注释。[GitHub 自定义工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 发布前后检查

- 静态资源使用相对路径，确保在 `/springboot-launcher/` 子路径下可以访问。
- 页面中的终端输出、截图和配置示例使用公开示例数据，不放入真实业务日志、路径或凭据。
- 检查中英文切换、安装命令复制、移动端布局与文档链接。
- 在 Actions 中确认本次 **GitHub Pages** 工作流成功，再打开官网检查首页及资源是否加载。

如果首次部署在“读取 Pages 配置”失败，先确认发布来源已经选为 GitHub Actions；如果页面资源返回 404，检查资源路径是否错误地从域名根目录 `/` 开始。

## 当前 action 版本

| action | 固定版本 |
| --- | --- |
| `actions/checkout` | [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) |
| `actions/configure-pages` | [v6.0.0](https://github.com/actions/configure-pages/releases/tag/v6.0.0) |
| `actions/upload-pages-artifact` | [v5.0.0](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0) |
| `actions/deploy-pages` | [v5.0.1](https://github.com/actions/deploy-pages/releases/tag/v5.0.1) |
