# 第三方来源与许可证

LICENSE 沿用参考工程 Apache License 2.0 文本，保留原有 `Copyright [qiyifeng]`，不得替换来源版权。

## 已改编代码

[DSH Spring Boot Launcher](https://github.com/simplifyOurLife/dsh-spring-boot-launcher)，Apache-2.0。来源修订 ff5862a38086a726c637e967ef0adf8ec8cd37a1；`src/jdk-discovery.js` 改编为本项目 `src/project/jdk.mjs`。源文件 SHA-256 为 46057B0EF4A98973DA3CB0CA8D568580D925A5EDCF8EF9A08A2C6EEFDED743FA。

修改为异步 Java 版本探测与原生参数数组，删除宿主依赖；文件头保留来源及修改声明。未复制旧宿主入口，其他模块独立实现。来源目录未发现单独 NOTICE 文件。

后续运行兼容性改造研究了同项目 `src/index.js` 的服务入口筛选、薄 jar、assembly、reactor 依赖闭包、资源目录与模式选择策略；采用独立的 ESM 模块和参数数组重新实现。没有移入 DSH 宿主 API、拼接 Shell 的启动代码或删除依赖 jar 的逻辑。具体差异和验证见[兼容性记录](docs/verification/dsh-compatibility-2026-10-10.md)。

后续也参考其启动失败后受限降级及 stopSpringBootCore 的先非强制停止、等待、再强制停止顺序，仍使用本项目的执行器与日志管道实现。离线缓存缺失后自动联网一次是本项目新增策略，不宣称 dsh 已提供；边界见[基础版本发布说明](docs/releases/0.1.0.md)。

## 锁定依赖

以下来自实际安装及 package-lock.json；开发依赖不打入产品源码包，依赖通过 npm 单独安装并保留各自许可证。

| 包 | 版本 | 许可证 | 类型 |
| --- | --- | --- | --- |
| @modelcontextprotocol/client | 2.3.1 | Apache-2.0 | 开发／传递 |
| @modelcontextprotocol/core | 2.3.1 | Apache-2.0 | 运行／传递 |
| @modelcontextprotocol/server | 2.3.1 | Apache-2.0 | 运行／传递 |
| cross-spawn | 7.0.6 | MIT | 开发／传递 |
| eventsource | 3.0.7 | MIT | 开发／传递 |
| eventsource-parser | 3.1.1 | MIT | 开发／传递 |
| isexe | 2.0.0 | ISC | 开发／传递 |
| jose | 6.2.12 | MIT | 开发／传递 |
| path-key | 3.1.1 | MIT | 开发／传递 |
| pkce-challenge | 5.0.1 | MIT | 开发／传递 |
| shebang-command | 2.0.0 | MIT | 开发／传递 |
| shebang-regex | 3.0.0 | MIT | 开发／传递 |
| which | 2.0.2 | ISC | 开发／传递 |
| yaml | 2.9.1 | ISC | 运行 |
| zod | 4.6.5 | MIT | 运行／传递 |

来源：[MCP 官方 SDK](https://github.com/modelcontextprotocol/typescript-sdk)、[Zod](https://github.com/colinhacks/zod)、[YAML](https://github.com/eemeli/yaml)（Copyright Eemeli Aro）。YAML 用于解析项目配置中的 Profile 元数据，不在面板中执行配置内容。所有依赖的准确来源和完整性哈希保留于锁文件，各包完整许可由 npm 依赖随附。

## 图片与其他资源

公开 Java 示例声明 Spring Boot parent、Web MVC 与 Actuator 4.1.1，Apache-2.0，版本及 starter 依据 [Spring 官方入门文档](https://docs.spring.io/spring-boot/tutorial/first-application/index.html)。本次没有解析或下载示例 Maven 依赖，不将其传递依赖视作已完成许可审计；源码和资源为本项目编写，未带入外部 jar。

界面图由本项目实现的页面在隔离模拟环境截取，不含业务数据。页面使用系统字体，无外部图片或在线字体请求。

`assets/springboot-launcher.svg` 复用本项目页面品牌图形，`assets/springboot-launcher.ico` 是其 Windows 多尺寸导出版本，没有引入新的外部图标来源。

面板内嵌 [Phosphor Icons](https://github.com/phosphor-icons/core) 的 regular SVG 图标，MIT License，Copyright (c) 2023 Phosphor Icons。固定来源修订为 `2b75f3ad12b420c9504ef05df8d2564a28f8500e`，路径数据来自 `assets/regular/`，只改为共享 symbol 引用，未改绘图路径。完整原始许可随源码保留于 [web/licenses/phosphor-icons.txt](web/licenses/phosphor-icons.txt)。

发行包保留本说明、源码修改声明、第三方资源许可和 LICENSE。再分发遵守 [Apache-2.0 条款](https://www.apache.org/licenses/LICENSE-2.0)及对应第三方许可。
