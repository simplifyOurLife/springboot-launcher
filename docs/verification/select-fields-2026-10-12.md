# 下拉框样式与交互验证

面板的语言、Profile、运行模式、JDK 使用同一下拉增强层；原生 select 仍为值与 input／change 事件的来源。动态选项、禁用状态及语言更新同步到可见控件，不引入外部组件依赖。

隔离临时工程验证通过：

- 鼠标切换英文再返回中文，所有控件文案同步。
- 运行模式用方向键选中可执行 jar，Enter 提交；切换语言后保持该值。
- Profile 选择 dev 后正确回显；原始 Profile 名称不翻译。
- JDK 不兼容项为禁用状态；自定义 JDK 选项显示目录输入框。
- Esc 关闭列表，选中项使用柔和背景和勾号；浮层限制高度并使用内部滚动，按视口空间选择上下展开。
- 模块语法检查通过。未运行全量回归、真实 Java／Maven 或前端构建。

截图：docs/assets/panel-select-profile.jpg、docs/assets/panel-select-jdk.jpg。样例不包含业务工程数据。
