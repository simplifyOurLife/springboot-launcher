# 第三方来源与许可证

## 当前材料

LICENSE 沿用下述参考工程的 Apache License 2.0 文本，并保留其中原有的 `Copyright [qiyifeng]` 标记；不得删除或替换该来源版权。

## 计划迁移的参考工程

| 来源 | 许可证 | 计划参考范围 | 当前状态 |
| --- | --- | --- | --- |
| [DSH Spring Boot Launcher](https://github.com/simplifyOurLife/dsh-spring-boot-launcher) | Apache-2.0 | JDK 候选发现 | src/jdk-discovery.js 改编为本项目 src/project/jdk.mjs；来源 main 为 ff5862a38086a726c637e967ef0adf8ec8cd37a1 |

源 jdk-discovery.js 的 SHA-256：46057B0EF4A98973DA3CB0CA8D568580D925A5EDCF8EF9A08A2C6EEFDED743FA。适配改为异步 Java 版本探测、原生参数数组，删除宿主依赖；文件头保留来源及修改声明。其余新模块按本项目设计独立实现，未复制旧宿主入口。

移植时记录来源修订、实际复制文件、对应的新文件和修改说明；保留适用的版权、归属及 NOTICE，不将宿主专属实现或未经审查的材料整体带入新仓库。

## 运行依赖

官方 MCP Node.js SDK 是设计中的依赖候选，目前尚未安装或锁定版本。实现时根据实际锁文件记录依赖名称、精确版本、许可证及归属；当前不能宣称已经完成依赖许可核对。

## 发布前核对

- 来源记录对应实际移植内容及来源修订，不只写项目名称。
- 许可证、版权、适用 NOTICE 和修改声明随源码及发行包保留。
- 依赖清单与锁文件和实际发行包一致。
- 示例、图片及其他资源具有明确可公开来源。

依据：[Apache License 2.0 的再分发条款](https://www.apache.org/licenses/LICENSE-2.0)。
