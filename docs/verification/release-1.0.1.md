# 1.0.1 在线安装验证

## 发现与修复

1.0.0 正式发行资产的真实下载返回 Content-Type: application/octet-stream；PowerShell 7 Content 类型为 System.Byte[]，包含正确的 106 字节 SHA-256 校验文本。安装器直接按字符串匹配而失败，未绕过校验，也未覆盖旧版本。

隔离安装夹具改为与 HTTP 一致的 byte[]，并加入 UTF-8 BOM，先复现相同失败。修复后 Windows PowerShell 5.1 与 PowerShell 7 均通过安装、校验失败保护、活跃服务保护、升级、目录边界及压缩包穿越验证；普通文本响应仍覆盖。

使用修复后的本地安装器对已公开 1.0.0 资产完成真实下载、SHA-256、生产 npm 依赖准备、中文目录 Unicode 快捷方式、稳定入口、托管面板和同版本修复验证。现有真实后台及客户端配置哈希均保持一致。此项验证的是修复逻辑，不宣称原 1.0.0 安装器已经被更换。

## 正式发布与真实安装（2026-10-14）

- 发布提交 `de0a5b268c012d045547b2cb00351d788159c2ae` 的 [Windows CI](https://github.com/simplifyOurLife/springboot-launcher/actions/runs/38501501743) 通过；[标签触发的重复 CI](https://github.com/simplifyOurLife/springboot-launcher/actions/runs/38501854053) 亦通过。[发行工作流](https://github.com/simplifyOurLife/springboot-launcher/actions/runs/38501854028) 成功，正式 [v1.0.1 Release](https://github.com/simplifyOurLife/springboot-launcher/releases/tag/v1.0.1) 的 ZIP、checksums.txt、install.ps1 和 install.cmd 均存在。
- ZIP 的 SHA-256 为 `0fdf6d159f1171d0c09bfdf2a80008802891474f0dc261b41069e645737586c6`，与公开 checksums.txt 一致。实际执行下载的正式安装器，完成全新安装、生产依赖准备、稳定入口、托管面板、中文路径快捷方式及同版本修复验证。
- 使用新下载的正式安装器，将隔离的既有 1.0.0 安装升级至 1.0.1：稳定入口与面板均报告 1.0.1，1.0.0 版本目录仍保留，后续同版本修复成功。没有使用旧版内置升级向导。
- 两次真实验证均使用独立后台目录，跳过桌面及客户端自动注册。前后对比维护者真实后台实例文件、Codex 和 Claude Code 配置的哈希，均未改变；验证后台均已停止。
- [官网部署](https://github.com/simplifyOurLife/springboot-launcher/actions/runs/38501502012) 通过，官网与最新 install.cmd 下载入口均返回 HTTP 200。

## 未覆盖

无 Node 全新 Windows、不同企业网络、真实 WinForms 人工点击及客户端自动注册仍未覆盖，不据本次测试宣称已完成。隔离在线验证复用本机已有 Node，没有执行真实 Java、Maven 或前端构建。
