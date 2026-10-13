# JSP API classpath 修复

真实启动日志出现 `NoClassDefFoundError: javax/servlet/jsp/JspFactory`。只读检查依赖 jar 后确认，独立 JSP API jar 是该类的唯一提供者，Tomcat core 并不提供 JSP API。原过滤逻辑仅凭存在嵌入式容器就同时排除旧 Servlet API 和 JSP API，导致缺类。

修复后，启动器有界读取候选容器 jar 的 ZIP 中央目录，分别确认 Servlet 和 JSP 类条目。只有确认类已由容器提供时才排除对应独立 API；无法确认时保留依赖，并在启动计划原因中说明。磁盘 jar 不删除、不解压、不执行。

验证：

- 新增定向用例先复现“唯一的 JSP API 提供者必须保留”失败。
- 修改后，容器提供／未提供 JSP、无法读取候选 jar、注释文件、reactor classpath 和通配符压缩相关的 4 项定向用例通过。
- 用户真实工程的只读启动计划确认保留 JSP API jar，并继续排除容器已替代的旧 Servlet API jar。
- 未运行真实 Maven 或 Java 服务；应用完整启动仍待用户在更新后的面板验证。
