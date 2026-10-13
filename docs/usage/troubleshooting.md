# 故障排查

| 提示或现象 | 处理 |
| --- | --- |
| BUILD_REQUIRED | 普通启动会自动准备；noBuild:true 或准备后仍未生成所需产物时保留此诊断，检查自定义输出目录和插件布局。必要时展开准备命令，选中后 Ctrl+C 手工调整。 |
| BUILD_FAILED | 查看同一日志区的 Maven 输出和退出码。默认离线；明确检测到离线缓存缺失时自动联网重试一次；MCP 仍可显式固定 mvnOffline。检查 Maven Wrapper、MAVEN_HOME／M2_HOME／PATH 以及所选 JDK。 |
| AMBIGUOUS_ARTIFACT／AMBIGUOUS_MAIN_CLASS | 明确指定 jarPath 或 mainClass；选择实际可运行的应用模块。 |
| JDK_NOT_FOUND／JDK_VERSION_MISMATCH | 指定目标工程要求的 jdkHome；客户端进程的环境可能与终端不同。 |
| PORT_IN_USE | 换端口或自行处理占用程序。启动器不会按端口杀进程。 |
| 进程运行中，就绪未确认 | 查看日志；TCP 开放不等于应用健康。没有可识别启动完成证据时保持未确认。 |
| Profile 端口与面板不同 | 端口留空时由应用配置决定，面板不猜测实际监听端口；需要覆盖或预检查时明确填写。 |
| START_FAILED／快速退出 | 查看面板 stderr 和退出码，检查 JDK、Profile、依赖和应用配置。 |
| 面板访问失效或 401 | 重新执行 dashboard 或调用面板工具，用新单次链接打开；不要保存旧链接。 |
| 两个客户端看不到同一服务 | 比较当前 Windows 用户和 SPRINGBOOT_LAUNCHER_HOME，使用同一目录。 |
| PRIVATE_DIRECTORY_FAILED | 使用支持 Windows ACL 的本地磁盘空目录；核对当前用户权限。不要放宽认证或改为公网访问。 |
| BACKEND_UNAVAILABLE 且旧后台还在 | 先核对现有后台状态，不要删除锁强行创建第二份后台。 |
| 后台交接曾被中断 | backend.guard 的拥有者已退出时保守拒绝自动回收。先人工确认所有旧后台、托管进程及遗留记录，保留诊断副本后处理交接锁；不要在仍有后台时删除它。 |
| SERVICE_RUNNING | 先停止服务；明确要停止全部时才使用 daemon stop --stop-services。 |
| ORPHANED_SERVICE | 人工检查并处理旧进程，确认服务不再运行后，按下述命令遗忘记录。禁止依旧 PID 盲目终止。 |
| 日志缺口／写盘失败 | 内存、事件数量、快照与磁盘都有上限，面板会提示缺口。写盘失败时持续显示警告；修复权限或磁盘问题后停止再启动，恢复落盘。 |

人工处理后台异常后的遗留服务后，可确认遗忘该项目的旧记录：

```powershell
node .\bin\springboot-launcher.mjs daemon forget --dir "D:\demo\orders-service" --confirm-orphan
```

不要将此命令当作停止进程。它仅删除恢复记录；必须先确认旧服务已被人工处理。提交问题前脱敏路径、日志、配置和截图，不要附上后台实例文件、票据或 Cookie。

## 本地面板提示“需要有效的本机凭据或面板会话”

这表示浏览器没有当前后台认可的登录会话，常见于首次直接访问地址、后台重启或 8 小时会话到期。在启动器仓库目录执行：

```powershell
node .\bin\springboot-launcher.mjs dashboard
```

也可以让 Codex 或 Claude Code 调用 `spring_boot_dashboard`。命令按需创建或复用后台，生成 60 秒内有效、只能使用一次的访问链接，并打开浏览器；无需先在 CMD 保持 Node 服务运行。链接兑换成功后会自动移除地址中的票据，同一浏览器后续刷新可以继续使用会话。重新访问过期票据、收藏旧端口地址不能恢复登录，端口也可能在后台重启后改变。

旧版本在多个独立本机后台或模拟预览同时打开时，固定 Cookie 名称可能互相覆盖；现已按后台凭据派生独立 Cookie 名称。升级后台后重新执行一次打开命令建立新会话。开发预览地址不是正式后台的固定入口。

## 日志没有出现应用颜色

面板支持 ANSI SGR 标准色、256 色、RGB 和基本文字样式，保留文本安全性，不模拟清屏、光标定位或 OSC 链接。如果应用检测到输出管道而关闭颜色，可参照 [Spring Boot 官方日志文档](https://github.com/spring-projects/spring-boot/blob/main/documentation/spring-boot-docs/src/docs/antora/modules/reference/pages/features/logging.adoc)，在可信 Spring Boot 工程的配置中显式设置 `spring.output.ansi.enabled=ALWAYS` 后重启。面板不能恢复应用没有输出的颜色；文件日志、复制和 MCP 返回的 text 保持无控制序列的纯文本。

## Profile 或 JDK 自动识别与预期不同

选中项目后展开“运行设置”，可查看 Profile 来源、JDK 版本与兼容性；修改配置文件或安装 JDK 后点击“重新识别 Profile / JDK”。人工选择会保留；选回“自动”可继续采用应用配置或推荐版本。重启按钮复用上次实际启动参数，修改运行环境后应停止服务再启动。

Profile 扫描本地根目录、`config` 及一层子目录、`src/main/resources`、`target/classes` 中的标准 application 配置。支持 properties、YAML、多文档条件和分组，但不加载远程 import、自定义配置路径或完整 IDE 运行参数。未解析的 Maven 过滤占位符、外部配置会提示边界；以应用启动日志中的实际 Profile 为准。规则依据 [Spring Profile](https://docs.spring.io/spring-boot/reference/features/profiles.html)与[外部配置说明](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)，扫描不等同于 Spring 完整配置环境。

JDK 候选来自后台进程的环境变量、PATH、常见安装目录、已知安装的同级目录和用户 `.jdks`，推荐也参考项目 `.idea/misc.xml` 或 `.java-version`。它不会遍历整个磁盘。低于项目要求或只有 JRE 的候选不能在下拉框选用；缺少 release 元数据的可信安装可以选择“自定义 JDK 目录”，启动时再验证版本。若终端与 Codex 的 JAVA_HOME 不同，以后台实际环境为准。

升级源码不会替换已经运行的 Node 后台。确认服务均已停止后，执行 `node .\bin\springboot-launcher.mjs daemon stop`，再执行 `node .\bin\springboot-launcher.mjs dashboard` 以载入新后台；不必提前手工启动常驻 Node 命令。

## 同一个项目在 dsh 可以启动，这里提示缺少产物

dsh 的自动编译和依赖准备现已接入普通启动：检查到缺少或过期产物后执行 compile 和 dependency:copy-dependencies，嵌套 reactor 从根目录使用 -pl/-am，成功后重新检查并启动 Java。准备阶段在同一面板显示日志，可以停止或重启，不需要额外构建按钮。默认离线与 dsh 一致，明确的离线缓存缺失会自动切换联网重试一次；显式 jar 模式执行 package。Maven Wrapper 优先，其次使用 MAVEN_HOME、M2_HOME 或 PATH；仅固定本次子进程的 Java 环境。

准备脚本不会 clean 或删除旧依赖文件，但 Maven 自身会执行可信工程的编译插件并写入 target／本机仓库。复杂构建 Profile、插件定制仍需真实工程验收。Windows 批处理路径或参数含 CMD 元字符（例如 &、%、括号）时会拒绝执行并给出诊断；含中文和空格的普通路径已通过模拟测试。

薄 jar manifest 的 config/ 等资源目录不再要求包含 class；已有 jar 和依赖满足检查时可直接启动。重新导入工程根目录后，已确认没有 Boot 启动入口的基础库记录会从该范围清理；无法读取或仍运行／遗留的项目保留，磁盘工程不会删除。复核和限制见[dsh 兼容性记录](../verification/dsh-compatibility-2026-10-10.md)。

后台启动时也会复核旧导入记录，明确判定非应用且无运行或待确认遗留状态的模块才会移除；无法访问的路径保留。清理仅作用于启动器的逻辑列表，不删除工程。

## 停止较慢或没有关闭日志

点击停止后应立即出现“正在停止”的提示，对应服务行按钮显示加载动画，后台保持日志采集直到输出管道关闭。Windows Java 先非强制停止，等待最多 8 秒后才强制终止；等待期间不能把请求已发出当作服务已退出。若关闭钩子没有执行，或应用本身未输出关闭日志，面板不能补出这些内容。重启会等旧进程停止成功才启动新进程。

只需看日志时，可在日志工具栏分别收起项目栏和服务信息；服务名和展开入口仍可见。折叠不会暂停日志接收，刷新后恢复默认布局。

## 更新后仍提示“不支持参数”

源码更新不能替换已经运行的后台。先停止服务，正常退出旧后台，再重新执行 dashboard；不要直接复用旧端口或删除实例锁。当前版本的页面资源随后台启动载入，避免更新源码后实时读取新页面却继续使用旧接口。面板启动不再发送 mvnOffline 网络选项；需要固定网络策略时通过 MCP 显式设置。
