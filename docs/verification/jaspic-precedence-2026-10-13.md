# 容器 API 的 classpath 优先级

用户确认服务可启动，但首次访问接口触发 JASPIC `AuthConfigFactory` 异常。只读反汇编和 jar 条目检查确认，旧 Geronimo API 默认引用未提供的 Geronimo 工厂实现，而 Tomcat 同时提供自身 API 与实现。自动 classpath 原先按扫描文件顺序排列，Geronimo 位于 Tomcat 前面，导致错误 API 被优先加载。

修复：对已确认提供 Servlet、JSP 或 JASPIC 核心类的容器 jar 提高优先级，放在工作区 classes 后、其他依赖 jar 前。保留业务依赖；含优先容器的目录不压缩为 jar 通配符，避免丢失加载顺序。显式用户 classpath 不改写。

验证：新增用例先复现优先级失败；修复后相关 4 项定向检查通过。真实工程的只读启动计划中，`AuthConfigFactory` 首个提供者为 Tomcat，必需 JSP API 保留，旧 Geronimo jar 保留在后面。未执行真实 Java 或 Maven 构建；HTTP 请求结果待用户重启服务后验证。
