# 安装、独立打开与升级

## 选择安装方式

普通使用者从[官网](https://simplifyOurLife.github.io/springboot-launcher/#get-started)下载 `install.cmd` 并双击，或直接前往 [1.0.1 Release](https://github.com/simplifyOurLife/springboot-launcher/releases/tag/v1.0.1)。引导从本仓库最新正式 Release 下载安装器，打开 Windows 安装向导；网络需允许 GitHub 与 npm，缺少 Node.js 时还需访问 nodejs.org。无需 Git 或手工替换安装路径。

向导默认放在当前用户的 Programs 目录，也可点击“选择目录”。选择已有托管安装可升级，选择其他位置会建立独立安装；非空的普通目录和源码目录不会被覆盖。

可以勾选创建桌面和开始菜单快捷方式，也可按需接入已安装的 Codex／Claude Code。未勾选的客户端配置不会修改；Claude Code 使用当前用户范围，所有工程可用。完成后重新打开客户端检查 MCP 连接。

## 每天如何打开

从 1.0.0 升级到 1.0.1 时，请重新下载官网或 Release 的最新 install.cmd，并选择原安装目录。1.0.0 内置向导存在校验文件解析问题，不能通过它完成本次修复。

双击桌面或开始菜单中的 **Spring Boot Launcher**，后台按需启动并打开当前有效的本机页面。未创建快捷方式时，也可双击安装目录的 `Open Dashboard.cmd`。关闭网页或 AI 聊天不停止托管服务；无需先在 CMD 启动 Node 后台。

源码用户双击根目录 `Open Dashboard.cmd`；左上角版本按钮中的“创建桌面快捷方式”可为当前源码目录创建入口。把快捷方式移动或卸载 Node.js 后无法打开时，回到当前目录重新创建。

桌面入口使用启动器自己的多尺寸品牌图标。若此前生成的旧入口报“路径中具有非法字符”，使用当前版本重新创建快捷方式即可；新版入口会按脚本位置识别目录，无需手工编辑路径参数。

入口图标会保存在当前用户应用数据目录，重新创建时自动使用当前版本并通知 Windows 更新显示。

中文目录通过 [Windows Unicode 快捷方式接口](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-ishelllinkw) 保存并重新校验，不依赖系统是否开启 UTF-8 代码页。

直接收藏自动端口地址无法长期保证会话有效，应收藏桌面入口或每次使用打开命令生成新会话。

## 升级规则

左上角版本号打开以下窗口，可检查更新、创建桌面入口或打开安装向导。截图使用 1.0.1 的公开示例界面。

![1.0.1 工作台左上角提供版本与更新入口](../assets/panel-v1.0.1-workbench.jpg)

- 左上角显示当前版本，后台只检查本项目公开 GitHub Release，不发送工程路径、运行状态或日志。检查结果缓存半小时，点击“检查更新”可刷新；没有网络时不影响现有服务。
- 点击“打开升级向导”后，先下载发行包、验证 SHA-256 并准备锁定依赖，随后才尝试退出旧后台。
- 默认不停止正在运行的服务；它们会阻止升级。可手动停止后重试，或在向导勾选“升级前停止托管服务”。停止后不会自动重新运行 Java 工程。
- 首次安装也会检查同一用户的共享后台，防止安装完成后仍打开源码版旧页面。已有服务运行时，先在原面板手动停止服务，再继续安装。
- 托管安装目录下的 `versions/版本号` 相互独立，`installation.json` 指向当前版本。稳定的 `launcher.mjs` 入口保持不变，MCP 路径通常无需重新配置；已有客户端需重新打开。
- 原版本目录保留，不自动删除工程、日志或历史安装。下载、校验、依赖准备或旧后台停止失败时，当前版本记录保持不变。
- Git 工作树只提供独立安装向导，不自动 `git pull`、重置或覆盖本地修改。

## 命令行安装

可信的本地安装器也可指定目录运行，省略客户端开关不会修改其配置：

```powershell
pwsh -NoProfile -File .\scripts\install.ps1 -NoGui -InstallRoot 'D:\tools\SpringBootLauncher'
```

`-Codex`、`-ClaudeCode` 可按需增加，`-StopServices` 明确允许升级前停止托管服务，`-NoOpen` 不在结束时打开浏览器。安装过程只准备启动器依赖；Java 工程的编译仍只在用户启动对应服务时按既有规则执行。

安装器没有代码签名。浏览器或 Windows 要求人工判断下载来源时，应核对本项目仓库和 Release；程序不会自动绕过系统警告。
