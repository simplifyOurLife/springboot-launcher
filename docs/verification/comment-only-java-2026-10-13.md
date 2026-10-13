# 全注释 Java 文件的启动校验修复

真实服务启动日志已显示 Maven `BUILD SUCCESS`，随后仍被启动器以“尚未编译的 Java 源码”阻断。只读比对发现，内部依赖模块存在两个整文件注释的 `.java` 文件；这些文件不生成对应字节码，逐文件校验因此产生误报。

修复只在对应 class 缺失或过期时读取源码，跳过仅含注释或空白的文件。真实源码仍保留缺失和新鲜度检查，报错包含文件路径；字符串中的 URL 或注释符号不会被当成注释处理。

验证：

- 修改前，注释文件和 reactor 依赖的两项定向用例均复现 `BUILD_REQUIRED`。
- 修改后，运行 `node --test --test-name-pattern='完全注释|嵌套 reactor|增量编译|只有文档|缺失或陈旧' tests/dsh-compatibility.test.mjs`，5 项通过。
- 对用户真实工程现有产物执行只读 `prepareLaunch`，成功生成 classpath 模式启动计划。
- 未执行真实 Maven、Java 服务启动或全量回归；服务就绪仍需用户在面板验证。
