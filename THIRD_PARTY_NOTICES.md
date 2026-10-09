# 第三方来源与许可证

LICENSE 沿用参考工程 Apache License 2.0 文本，保留原有 `Copyright [qiyifeng]`，不得替换来源版权。

## 已改编代码

[DSH Spring Boot Launcher](https://github.com/simplifyOurLife/dsh-spring-boot-launcher)，Apache-2.0。来源修订 ff5862a38086a726c637e967ef0adf8ec8cd37a1；`src/jdk-discovery.js` 改编为本项目 `src/project/jdk.mjs`。源文件 SHA-256 为 46057B0EF4A98973DA3CB0CA8D568580D925A5EDCF8EF9A08A2C6EEFDED743FA。

修改为异步 Java 版本探测与原生参数数组，删除宿主依赖；文件头保留来源及修改声明。未复制旧宿主入口，其他模块独立实现。来源目录未发现单独 NOTICE 文件。

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
| zod | 4.6.5 | MIT | 运行／传递 |

来源：[MCP 官方 SDK](https://github.com/modelcontextprotocol/typescript-sdk)、[Zod](https://github.com/colinhacks/zod)。所有依赖的准确来源和完整性哈希保留于锁文件。

## 图片与其他资源

界面图由本项目实现的页面在隔离模拟环境截取，无外部图片、图标或字体素材。截图不含业务数据。发行包保留本说明、源码修改声明和 LICENSE。再分发遵守 [Apache-2.0 条款](https://www.apache.org/licenses/LICENSE-2.0)。
