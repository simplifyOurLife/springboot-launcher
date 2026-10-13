# 可公开的 Spring Boot 验收示例

该源码用于手工验收真实 Java 启停、中文日志、stderr、Profile 和 Actuator。**本次只完成源码与启动器只读检查，未执行 Maven 构建或 Java 运行；不能视为已验收。**

示例固定 Spring Boot 4.1.1、Java 17；版本、Web MVC starter 依据 [Spring Boot 官方入门文档](https://docs.spring.io/spring-boot/tutorial/first-application/index.html)，Maven 至少 3.6.3，见[系统要求](https://docs.spring.io/spring-boot/system-requirements.html)。该示例不需要数据库或凭据，应用只绑定 127.0.0.1。

由你在本示例目录**手工执行构建**：

```powershell
mvn package
```

构建会按你的 Maven 配置下载依赖。完成后，在启动器面板添加该目录，使用 jar 模式（或自动模式），选择 JDK 17 或兼容版本。默认端口 8087，可选健康检查地址 `http://127.0.0.1:8087/actuator/health`。

- 面板每 5 秒出现中文日志，每三次输出一次演示 stderr；HTML 文字应原样展示。
- 浏览器打开 `http://127.0.0.1:8087/ping`，应返回中文 JSON；健康接口应返回 UP。
- 启用 Spring Profile `local` 并将端口覆盖留空，应用应使用 8088；健康检查地址也相应改为 8088。
- 按[Alpha 简短验收表](../../docs/verification/alpha-acceptance.md) 测试 Codex 启动、CC 查询停止，以及反向操作，并记录真实结果。

停止服务由面板或 MCP 执行。上文采用手工构建以单独验证已有产物路径；如要验收自动准备，可在允许编译和下载的本示例中直接普通启动，缺少或过期产物时启动器会托管 Maven 准备。固定只运行已有产物时通过 MCP 设置 noBuild:true。不要提交 target、logs 或本机状态。
