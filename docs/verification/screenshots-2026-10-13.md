# 0.2.0 文档与官网截图更新

使用当前 `web/` 页面代码和隔离后台协议生成截图。工程路径统一为 `D:\demo\springboot-workspace`，JDK 路径为示例值；服务状态、PID 与日志均为模拟数据，没有运行真实 Java／Maven，也不读取真实业务工程。

## 入口图片

| 用途 | 当前图片 |
| --- | --- |
| 英文 README／官网工作台 | [英文工作台](../assets/panel-v0.2.0-workbench-en.jpg) |
| 中文 README／官网工作台 | [中文工作台](../assets/panel-v0.2.0-workbench.jpg) |
| 英文日志专注视图 | [英文日志视图](../assets/panel-v0.2.0-log-focus-en.jpg) |
| 中文日志专注视图 | [中文日志视图](../assets/panel-v0.2.0-log-focus.jpg) |
| 安装说明中的版本入口 | [版本窗口](../assets/panel-v0.2.0-updates.jpg) |
| 运行配置说明 | [Profile 下拉选项](../assets/panel-v0.2.0-runtime-settings.jpg) |
| 服务管理说明 | [移除确认](../assets/panel-v0.2.0-remove-service.jpg) |

截图按官网既有 1280×720 资源规格保存。旧验收记录的图片保留，新的入口文件使用 `panel-v0.2.0-` 前缀；官网同步副本，并在 URL 中添加版本标记。

本轮仅检查截图内容、资源引用、官网中英文切换及工作台／专注视图切换，不执行构建或全量回归。没有提交、推送、发布 Release 或部署官网；线上仍以此前已发布资源为准。

实际检查：7 张图片尺寸均为 1280×720；14 处新图引用有效，官网 4 份副本与文档原图一致。本地 `/springboot-launcher/` 子路径下，中英文工作台和专注视图均加载成功，控制台无错误；JavaScript 语法与 Git 空白检查通过。
