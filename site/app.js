// 英文为公开主页默认语言；用户的显式选择仅保存在本站来源下。
const zh = {
  guidedTitle:'更习惯安装向导？',guidedText:'下载并打开 Windows 在线安装引导，选择安装位置、创建桌面入口，并按需接入 Codex 或 Claude Code。',guidedDownload:'下载安装引导',guidedNote:'需要已发布的正式发行版和网络连接。缺少 Node.js 时，向导可下载官方便携环境。',clientScope:'Claude Code 命令使用 user 范围，当前用户的各个工程都能使用此 MCP。',skip:'跳到正文',navigation:'主导航',overview:'功能概览',getStarted:'开始使用',eyebrow:'让本地开发更从容',heroLine1:'服务，都在这里。',heroLine2:'专注你的开发。',heroDescription:'启动 Spring Boot 服务、查看实时日志。在 Codex、Claude Code 或浏览器中，接着做你的事。',viewSource:'在 GitHub 查看源码',localTitle:'你的电脑。\n你的工作方式。',localDescription:'共享本机后台，连接 AI 工具和网页面板。聊天结束，服务继续运行。',productPreview:'产品预览',previewLabel:'服务有序归位，日志尽收眼底。',previewMode:'预览模式',workbench:'完整工作台',focus:'专注日志',previewCaption:'1.0 系列界面（采集于 1.0.0），使用隔离示例项目和模拟日志。此处仅作展示，实际服务在你的本机应用中运行。',capabilitiesTitle:'保留上下文，\n减少窗口切换。',capabilitiesIntro:'把日常服务管理，放进同一个本地工作区。',capabilitiesLink:'查看详细文档 ↗',feature1Title:'项目管理，井然有序',feature1Text:'通过系统文件夹窗口导入项目，用文件夹分组管理服务，直接启动、停止或重启。',feature2Title:'日志，读得清也找得到',feature2Text:'保留 ANSI 颜色与连续上下文。在搜索命中间跳转，暂停自动滚动，或收起其他区域专注日志。',feature3Title:'少一些启动前的准备',feature3Text:'自动发现本机 JDK 和项目 Profile。优先复用已有产物，必要时自动准备 Maven 编译和运行依赖。',connectionTitle:'一个后台，多种使用方式。',connectionDescription:'本机服务管理器，配备八个 MCP 工具、命令行和网页面板。按你的习惯组合使用。',browserClient:'浏览器 / CLI',backendLabel:'共享本机后台',serviceLabel:'你的 Spring Boot 项目',connectionNote:'客户端使用相同 Windows 用户和后台目录时，共享服务状态。无需注册账号或连接云端服务。',installTitle:'从获取源码，\n到启动第一个服务。',installDescription:'安装一次，打开面板，再接入你常用的 AI 客户端。',requirementsTitle:'开始前准备',requirementNode:'Node.js ≥ 22.22.2，向导可按需自动安装',requirementJdk:'与目标工程兼容的 JDK',requirementMaven:'Maven 或项目自带的 Maven Wrapper',installHelp:'完整安装说明 ↗',step1Title:'安装并打开面板',step1Text:'在希望存放源码的目录下，打开 PowerShell 执行。',copy:'复制',step1Note:'后台按需启动，并打开已认证的本机面板。导入一个可信项目，即可开始使用。',step2Title:'连接 AI 客户端',step2Text:'在同一个源码目录执行对应客户端的命令，完成后重新打开客户端。',mcpClient:'MCP 客户端',step3Title:'直接说出你的需求',examplePrompt:'“检查 D:\\demo\\orders-service，以 local Profile 和 8087 端口启动，并打开实时日志面板。”',step3Note:'缺少产物时可能触发 Maven 编译及依赖下载，请仅运行可信工程。',faqTitle:'你可能还想知道。',faq1Title:'这个网站能直接控制我的服务吗？',faq1Text:'这是公开的项目介绍网站。实际应用运行在你的电脑上，并打开自己的已认证面板。使用上方的 dashboard 命令即可启动。',faq2Title:'需要一直开着命令行窗口吗？',faq2Text:'不需要。后台会按需启动，关闭用于启动的终端或 AI 聊天不会停止托管服务。请通过面板或 CLI 停止服务。',faq3Title:'支持哪些项目和系统？',faq3Text:'当前面向 Windows 上的本机 Maven Spring Boot 开发。Gradle、macOS、Linux 和远程管理尚未纳入当前验收范围；复杂构建配置可能需要手动调整。',faq4Title:'这是 Spring 或 AI 客户端的官方产品吗？',faq4Text:'这是采用 Apache-2.0 许可证的独立开源项目，与 Spring Boot、Codex 或 Claude Code 无官方隶属关系。代码来源及当前限制可在仓库中查看。',footerText:'让本地开发顺畅一点。',feedback:'问题反馈',credits:'来源说明'
};
const en = new Map();
document.querySelectorAll('[data-i18n]').forEach(el=>{const copy=el.cloneNode(true);copy.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));en.set(el.dataset.i18n,copy.textContent);});
document.querySelectorAll('[data-i18n-aria]').forEach(el=>en.set(el.dataset.i18nAria,el.getAttribute('aria-label')));
let language='en',preview='workbench';
try{if(localStorage.getItem('sbl-site-language')==='zh-CN')language='zh-CN';}catch{}
const languageButton=document.querySelector('#language');
const screenshot=document.querySelector('#preview-image');
const message=(key)=>language==='zh-CN'?zh[key]:en.get(key);
function updatePreview(){
  const image=preview==='focus'?(language==='zh-CN'?'log-focus':'log-focus-en'):`workbench-${language==='zh-CN'?'zh':'en'}`;
  screenshot.src=`./assets/${image}.jpg?v=1.0.0`;
  screenshot.alt=language==='zh-CN'?(preview==='focus'?'收起项目栏和服务信息后的日志专注视图':'包含项目列表和实时彩色日志的 Spring Boot 启动器工作台'):(preview==='focus'?'Log-focused dashboard with project and service sections collapsed':'Spring Boot Launcher workspace with a project sidebar and colored logs');
}
function applyLanguage(){
  document.documentElement.lang=language;
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=message(el.dataset.i18n);});
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{el.setAttribute('aria-label',message(el.dataset.i18nAria));});
  languageButton.textContent=language==='en'?'中文':'English';
  languageButton.setAttribute('aria-label',language==='en'?'Switch to Simplified Chinese':'切换为英语');
  document.title=language==='en'?'Spring Boot Launcher | Your local service workspace':'Spring Boot Launcher | 你的本机服务工作区';
  document.querySelector('#readme-link').href=language==='en'?'https://github.com/simplifyOurLife/springboot-launcher#requirements-and-installation':'https://github.com/simplifyOurLife/springboot-launcher/blob/main/README.zh-CN.md';
  updatePreview();
}
languageButton.addEventListener('click',()=>{language=language==='en'?'zh-CN':'en';try{localStorage.setItem('sbl-site-language',language);}catch{}applyLanguage();});
document.querySelectorAll('[data-preview]').forEach(button=>button.addEventListener('click',()=>{preview=button.dataset.preview;document.querySelectorAll('[data-preview]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));updatePreview();}));
document.querySelectorAll('[data-client]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-client]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  const command=button.dataset.client==='codex'?'codex mcp add springboot-launcher -- node $launcher mcp':'claude mcp add --transport stdio --scope user springboot-launcher -- node $launcher mcp';
  document.querySelector('#client-code').textContent='$launcher = (Resolve-Path .\\bin\\springboot-launcher.mjs).Path\n'+command;
}));
document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{
  const value=document.getElementById(button.dataset.copy).textContent;
  button.disabled=true;
  try{
    await navigator.clipboard.writeText(value);
    button.textContent=language==='zh-CN'?'已复制':'Copied';
    document.querySelector('#copy-status').textContent=language==='zh-CN'?'命令已复制到剪贴板':'Command copied to clipboard';
  }catch{
    // 无剪贴板权限时选中文本，用户可直接通过系统快捷键复制。
    const range=document.createRange();range.selectNodeContents(document.getElementById(button.dataset.copy));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    button.textContent=language==='zh-CN'?'请手动复制':'Copy manually';
    document.querySelector('#copy-status').textContent=language==='zh-CN'?'已选中命令，请按 Ctrl+C 复制':'Command selected. Press Ctrl+C to copy.';
  }finally{button.disabled=false;setTimeout(()=>{button.textContent=message('copy');},2200);}
}));
applyLanguage();
