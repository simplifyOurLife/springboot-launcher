# Spring Boot 启动器 MVP 实施计划

> **执行者必读：** 使用 superpowers:executing-plans（当前推荐）或用户选择的 superpowers:subagent-driven-development，按任务逐项实现。本文件的检查项表示工作步骤，未勾选不代表已执行。读取设计后再执行；不自动创建 worktree。

**目标：** 在 Windows 上交付可通过 Codex、Claude Code 和网页管理同一组 Spring Boot 服务的本地 MVP，并完成 GitHub 源码发布所需准备。

**架构：** 每个客户端运行一个 STDIO MCP 代理，代理按需连接当前用户的唯一后台。后台管理 Java 子进程、认证、状态和日志；静态网页通过同源接口和 SSE 操作、查看同一注册表。

**技术栈：** Node.js ESM 22.22.2、Node.js 内置 HTTP／SSE／文件／子进程／测试能力、官方 MCP SDK v2、Zod v4、无构建步骤的 HTML／CSS／JavaScript。

**设计依据：** [已获用户确认的 MVP 设计](../specs/2026-10-09-shared-springboot-launcher-design.md)。用户已确认计划并要求继续，采用当前会话逐项实现、整版一次独立审阅的方式。

## 全局约束

- Node.js 最低版本及测试基线均为 22.22.2；首版验收为 Windows 11、PowerShell 7、Maven Spring Boot。
- 不自动执行 Java 或前端 build，不自动下载 Maven 依赖；产物缺失或过期返回 BUILD_REQUIRED。
- 多个入口共用唯一后台和项目互斥；聊天／代理退出不停止 JVM。
- Java 启动采用参数数组、shell=false、windowsHide=true；停止只使用已托管子进程句柄。
- 后台只监听 127.0.0.1；控制凭据至少 32 字节；面板单次票据 60 秒有效，会话 8 小时有效。
- 内存日志每服务最多 512 KiB；磁盘每份最多 10 MiB、合计最多四份；MCP 日志默认 100 行、最多 1000 行及 256 KiB。
- 不按端口或旧 PID 终止未知进程；异常遗留服务需人工确认，不能直接重复启动。
- 文档、关键日志、注释和提交信息中文优先；保留 Apache-2.0、原版权及实际移植来源。
- 默认在当前独立仓库的工作树推进，GitHub 创建／推送／公开发布另行确认。
- 自动测试只用临时项目、受控 Node.js 子进程或替身及本地接口；真实 Spring Boot 构建与验收由用户进行。

## 审查重点

1. 中文／空格／跨盘符项目路径必须按参数原样传递；Task 1／3 用路径与 spawn 参数断言固定行为。
2. Windows 大小写、真实路径与目录联接不能形成两套项目；Task 1／3 验证规范化、扫描不跟随联接及同项目互斥。
3. 停止未完成、刚启动就退出、启动重启重叠时不能多生成 JVM；Task 3 验证事件和操作竞态。
4. 多个 jar、薄 jar 缺依赖、兄弟模块产物过期时不能选错产物；Task 1 验证明确拒绝或显式参数选择。
5. SSE 慢消费者、断线重连和日志轮转不能导致无界缓冲或伪造连续日志；Task 2／4／7 验证限制、序号和缺口提示。

## 文件职责与公共契约

| 文件／目录 | 责任 | 所属任务 |
| --- | --- | --- |
| package.json、tests/helpers/project-fixtures.mjs | ESM、测试入口及公开临时工程夹具 | 1 |
| src/project/{paths,pom,discover,inspect,jdk,jar-manifest,launch-plan}.mjs | 项目、JDK、产物和 Java 参数 | 1 |
| src/core/{errors,contracts}.mjs | 中文结构化错误、共享结果和工具约束 | 1 |
| src/logs/log-store.mjs | UTF-8、日志缓冲／轮转、序号和订阅 | 2 |
| src/services/{executor,manager,health}.mjs | 托管句柄、状态、互斥、启停／重启和就绪证据 | 3 |
| src/backend/{auth,server,body,events}.mjs | 回环 HTTP、票据／会话、接口和 SSE | 4 |
| src/runtime/{home,private-dir,instance,client,daemon}.mjs、scripts/private-dir.ps1 | 私有目录、单实例、连接和后台入口 | 5 |
| src/mcp/server.mjs、bin/springboot-launcher.mjs、package-lock.json | MCP 和本地命令入口、锁定依赖 | 6 |
| web/{index.html,styles.css,app.mjs,state.mjs} | 中文管理面板及有限日志显示 | 7 |
| .github/workflows/test.yml、docs/usage、docs/verification、CHANGELOG.md | 接入、验证、CI 与开源交付 | 8 |

公共数据结构在 src/core/contracts.mjs 用 JSDoc 定义，校验共用常量；以下字段在各任务之间必须保持一致：

- LaunchRequest = {dir, profile?, port?, jdkHome?, mode?:'auto'|'jar'|'classpath', jarPath?, mainClass?, classpath?:string[], jvmArgs?:string[], healthUrl?:string}。healthUrl 在整版审阅中补齐，对应设计的显式健康证据。
- ProjectInfo = {matched, projectKey, dir, mainClasses, profiles, port, requiredJavaMajor, reactorRoot, artifacts, warnings}；artifacts 包含 jarCandidates、classDirs、dependencyJars、srcNewestMtime。
- LaunchPlan = {projectKey, dir, executable, args:string[], mode, port, profile, mainClass, reasons}；不包含 shell 命令字符串，不把完整 args 输出为日志或公开状态。
- ServiceView = {projectKey, dir, status, pid, startedAt, mode, port, readiness, exitCode, logPath, error}；readiness = {ready, evidence, reason}，可选字段用 null，不使用不可序列化值。
- LogEvent = {projectKey, seq, time, source:'stdout'|'stderr'|'system', text}；单个项目 seq 单调递增。
- LogSnapshot = {events:LogEvent[],lastSeq,gap,text,truncated,persistenceError}；日志查询、HTTP 和 MCP 共用此结构。
- Result = {ok:true, data} 或 {ok:false, error:{code,message,details?}}；错误转换器不返回堆栈、控制凭据、票据或 cookie。
- BackendConnection = {origin, instanceId, token}，只在代理／本地命令内使用，禁止整体返回到 MCP 或网页。

测试夹具接口由 Task 1 提供：fixture(kind, overrides?) → {dir, jdkHome, jarPath, mainClass, classDir, cleanup}。支持 missing、stale、fat-jar、thin-jar、classes、reactor、ambiguous 等最小合成布局；cleanup 仅删除经绝对路径校验的本次临时根。fakeProbe 与 fakeExecutor 注入测试，不暴露为生产环境开关。

---

## Task 1：检查项目并生成可运行的 Java 参数

**文件：** 新建 package.json、上述 src/core 与 src/project 文件、tests/helpers/project-fixtures.mjs、tests/project.test.mjs；更新 THIRD_PARTY_NOTICES.md。

**接口：** 无产品前置依赖。输出 normalizeProjectDir(dir) → Promise<{dir,projectKey}>、discoverProjects(root, options?) → Promise<{projects,truncated,warnings}>、inspectProject(dir) → Promise<ProjectInfo>、resolveJdk({jdkHome,requiredJavaMajor,env,probeVersion}) → Promise<{home,executable,major}>、prepareLaunch(request,{inspect=inspectProject,resolveJdk}) → Promise<LaunchPlan>；失败抛 LauncherError(code,message,details?)。

- [x] **步骤 1：写失败测试。** 用合成 manifest、POM／源码和受控 mtime 定义夹具，不运行 Java。至少写下列断言，并增加 parent 属性、多入口／多 jar、薄 jar Class-Path 缺文件、兄弟模块过期和扫描上限用例：

```js
await assert.rejects(prepareLaunch({dir: missing.dir}, deps), {code:'BUILD_REQUIRED'});
await assert.rejects(prepareLaunch({dir: stale.dir}, deps), {code:'BUILD_REQUIRED'});
const plan = await prepareLaunch({dir: fresh.dir, port:8081, profile:'dev'}, deps);
assert.equal(plan.executable, javaExe);
assert.deepEqual(plan.args.slice(-3), [fresh.jarPath,'--spring.profiles.active=dev','--server.port=8081']);
assert.equal((await normalizeProjectDir(alias)).projectKey, (await normalizeProjectDir(real)).projectKey);
```

- [x] **步骤 2：运行 node --test tests/project.test.mjs，确认失败来自未实现的项目行为。** npm 测试入口设置为 node --test；Node 基线在 engines 中固定为 >=22.22.2。
- [x] **步骤 3：实现接口。** 参考旧工程 JDK 发现和项目分析，拆分并改为原生参数数组。扫描默认深度 6、最多 2000 个目录、5 秒截止；跳过联接、.git、node_modules、target。manifest 仅做受限 ZIP 元数据读取，不解压到磁盘；多个无法区分的候选返回明确歧义错误。禁止 classpath 缺项、@参数文件、-jar／-cp 入口覆盖和无效端口；保留 Spring 与 Maven Profile 区别。
- [x] **步骤 4：再次运行该测试并读完整输出，预期所有用例通过。** 确认没有调用 mvn、gradle 或 Java 编译器；记录实际复制文件、来源修订／哈希及修改声明。
- [x] **步骤 5：只提交本任务文件，提交信息为“功能：检查 Maven 项目并生成无构建启动计划”。**

## Task 2：有界日志、轮转和增量事件

**文件：** 新建 src/logs/log-store.mjs、tests/log-store.test.mjs。

**接口：** 消费 LogEvent 和 LauncherError。输出 createLogStore({maxBytes=524288,fileBytes=10485760,fileCount=4,clock,fs}) → {open(projectKey,dir),appendChunk(projectKey,source,bytes),finishStream(projectKey,source),snapshot(projectKey,{after?,lines?,maxBytes?}),subscribe(projectKey,listener),close(projectKey)}；snapshot 返回 {events,lastSeq,gap,text,truncated,persistenceError}，subscribe 返回取消订阅函数。

- [x] **步骤 1：写失败测试。** 按 stdout／stderr 分别维护解码状态，验证跨块中文、合计四份轮转、超大块、写盘失败及旧序号的缺口：

```js
store.appendChunk(key,'stdout',Buffer.from('中文').subarray(0,2));
store.appendChunk(key,'stdout',Buffer.from('中文').subarray(2));
assert.equal(store.snapshot(key,{lines:100}).text,'中文');
assert.ok(Buffer.byteLength(store.snapshot(key,{lines:1000,maxBytes:262144}).text)<=262144);
assert.equal(store.snapshot(key,{after:expiredSeq}).gap,true);
assert.equal(rotatedFiles.length,4);
```

- [x] **步骤 2：运行 node --test tests/log-store.test.mjs，预期日志行为失败。**
- [x] **步骤 3：实现日志接口。** 使用 StringDecoder、按字节截断且不切坏 UTF-8；写入日志前清理 ANSI。轮转仅操作固定的 springboot-launcher.log 及 .1／.2／.3，不删除其他文件。close 等待尾输出和写入完成，磁盘失败仍产生内存事件及明确警告。
- [x] **步骤 4：运行该测试，预期全部通过；并运行 node --test，确认 Task 1 未回归。**
- [x] **步骤 5：提交“功能：增加有界实时日志与文件轮转”。**

## Task 3：共享注册表与完整服务生命周期

**文件：** 新建 src/services/{executor,manager,health}.mjs、tests/services.test.mjs、tests/helpers/fake-java.mjs。

**接口：** 消费 prepareLaunch、createLogStore。输出 createJavaExecutor({spawn}) → {spawn(plan):ChildProcess}；createServiceManager({prepareLaunch,executor,logs,probePort,checkHealth,persistServices,initialRecords,clock}) → manager。start(request)、stop(dir)、restart(dir)、confirmOrphan(dir,{acknowledge}) 返回 Promise<ServiceView>；status(dir?) 返回 Promise<ServiceView|ServiceView[]>，未指定目录时返回数组；list() 返回 Promise<ServiceView[]>；logs(dir,options) 返回 Promise<LogSnapshot>；shutdown({stopServices=false}) 返回 Promise<void>；subscribe(listener) 返回取消订阅函数。不能序列化 ChildProcess、token 或重启配置。

- [x] **步骤 1：写失败测试。** 注入受控进程，验证并发、快速失败、停止超时、重启重叠、正常退出尾日志及 orphaned 拒绝。fake-java.mjs 可作为真实 Node 子进程输出模拟日志，但不会调用 Java：

```js
await Promise.all([manager.start(request),manager.start(request)]);
assert.equal(executor.spawnCount,1);
assert.equal(executor.lastOptions.shell,false);
assert.equal(executor.lastOptions.windowsHide,true);
await assert.rejects(manager.shutdown({stopServices:false}), {code:'SERVICE_RUNNING'});
await assert.rejects(orphanManager.start(request), {code:'ORPHANED_SERVICE'});
assert.equal((await manager.status(request.dir)).readiness.ready,false);
```

- [x] **步骤 2：运行 node --test tests/services.test.mjs，预期生命周期行为失败。**
- [x] **步骤 3：实现接口。** 单项目操作锁覆盖 start／stop／restart；提交启动尽快返回 starting。spawn 后立即绑定 error／exit／close 和两个输出流；停止等待 close 与尾输出，10 秒未结束返回 STOP_FAILED，禁止重启新 JVM。TCP、启动日志和 Actuator 证据分开；Actuator DOWN、401 或超时不能伪装健康，健康超时不杀 JVM。持久化仅允许非敏感元数据，异常旧记录全部标记 orphaned，confirmOrphan 只遗忘记录、不终止进程。
- [x] **步骤 4：运行该测试及 node --test，预期全部通过；核对中文路径和端口冲突不触发未知进程操作。**
- [x] **步骤 5：提交“功能：统一托管服务启停状态与并发控制”。**

## Task 4：已认证的回环接口、面板会话与 SSE

**文件：** 新建 src/backend/{auth,server,body,events}.mjs、tests/backend.test.mjs。

**接口：** 消费 ServiceManager、discoverProjects、inspectProject、Result 和 LogEvent。输出 createAuth({token,clock}) → {issueTicket(),exchangeTicket(ticket),authenticate(req),invalidate()}；startBackend({manager,auth,instanceId,webDir,onShutdown,discover=discoverProjects,inspect=inspectProject}) → Promise<{origin,close}>。HTTP 为 GET /api/health、POST /api/tools/{toolName}、POST /api/ticket、POST /api/session、GET /api/events 和 POST /api/shutdown；代理访问携带 Bearer 控制凭据，面板使用会话 cookie，票据接口仅允许代理凭据。八个工具由此统一分派：discover／inspect 调用检查器，start／status／logs／stop／restart 调用 manager，dashboard 产生单次票据 URL；成功与失败统一包为 Result。

- [x] **步骤 1：写失败测试。** 实际本机 HTTP 配合替身注册表，校验所有受保护路由，断言下列结果并覆盖伪造 Host／跨站、cookie、票据边界和 SSE 慢连接：

```js
assert.equal((await request('/api/health',{})).status,401);
assert.equal((await request('/api/health',{host:'evil.example'})).status,403);
assert.equal((await exchange(expiredTicket,now+60000)).status,401);
assert.equal((await exchange(ticket,now)).status,200);
assert.equal((await exchange(ticket,now)).status,401);
assert.equal((await postTool('spring_boot_start',hugeBody)).status,413);
assert.ok(sseQueueBytes<=524288);
```

- [x] **步骤 2：运行 node --test tests/backend.test.mjs，预期认证或接口用例失败。**
- [x] **步骤 3：实现接口。** 请求体上限 64 KiB、读取超时 5 秒；只监听 127.0.0.1:0。精确校验实际 Host 和浏览器同源，静态页面可以公开，但所有数据和操作都须认证。常量时间校验控制凭据；60 秒票据原子兑换，8 小时 HttpOnly／SameSite=Strict 会话，后台关闭全部失效。SSE 用 projectKey／after 序号，缓冲超限发送缺口并断开；慢连接不能阻塞其他服务。响应不带内部凭据或堆栈。
- [x] **步骤 4：运行该测试及 node --test，预期全部通过，SSE 断开后订阅与计时器释放。**
- [x] **步骤 5：提交“功能：提供本机认证控制接口与日志事件流”。**

## Task 5：自动发现唯一后台并独立于聊天运行

**文件：** 新建 src/runtime/{home,private-dir,instance,client,daemon}.mjs、scripts/private-dir.ps1、tests/runtime.test.mjs、tests/helpers/backend-worker.mjs。

**接口：** 消费 startBackend、createServiceManager。输出 preparePrivateHome(path) → Promise<string>、ensureBackend({home,timeoutMs=10000,spawnBackend,isProcessAlive,request}) → Promise<BackendConnection>、createBackendClient(connection) → client、runDaemon({home,managerFactory}) → Promise<void>。client.invoke(toolName,args) 返回 Promise<Result>；dashboard() 返回 Promise<Result<{url}>> 并复用 spring_boot_dashboard；shutdown(options) 返回 Promise<Result<{stopped:true}>>；confirmOrphan(dir,options) 返回 Promise<Result<ServiceView>>。生产 managerFactory 固定为真实 Java 组件，测试 worker 可注入受控 Node 子进程。

- [x] **步骤 1：写失败测试。** 用隔离临时目录和两个真实代理测试进程，验证原子锁及身份握手，不只用同进程 Promise 模拟竞争：

```js
assert.equal(first.instanceId,second.instanceId);
assert.equal(backendSpawnCount,1);
await firstProxy.exit();
assert.equal((await secondClient.invoke('spring_boot_status',{})).ok,true);
await assert.rejects(ensureBackend(liveBadLock), {code:'BACKEND_UNAVAILABLE'});
assert.equal(orphanSpawnCount,0);
```

- [x] **步骤 2：运行 node --test tests/runtime.test.mjs，预期共享后台或退出行为失败。**
- [x] **步骤 3：实现接口。** 默认 home 为 LOCALAPPDATA/springboot-launcher；覆盖变量为 SPRINGBOOT_LAUNCHER_HOME。使用独占创建锁、启动者 PID 和随机实例身份；不可达但锁拥有者尚存时不回收。后台隐藏、detached、stdio 不占用代理输出，存活后完成实例文件与锁交接；代理结束不清理后台。凭据、实例和服务元数据原子写入已检查的私有目录。PowerShell 权限助手仅处理明确指定且归本产品拥有的目录，通过 -File 参数调用，不插值拼命令，不递归修改任意现有目录。旧服务记录隔离为 orphaned，遗忘必须明确 acknowledge。关闭后台须先确认托管服务已停止。
- [x] **步骤 4：运行该测试及 node --test，预期全部通过；单独在临时目录验证 Windows ACL、中文／空格 home 及陈旧锁失败信息，记录实际证据。**
- [x] **步骤 5：提交“功能：实现按需连接的唯一后台与私有状态目录”。**

## Task 6：Codex／CC 通用 MCP 与本地命令

**文件：** 新建 src/mcp/server.mjs、bin/springboot-launcher.mjs、tests/mcp.test.mjs、tests/cli.test.mjs；更新 package.json、创建 package-lock.json。

**接口：** 消费 ensureBackend、createBackendClient。输出 createMcpServer({client}) → 官方 SDK McpServer；runCli(argv,{connect,stdout,stderr,openBrowser}) → Promise<number>。命令为 mcp、dashboard、status、daemon stop [--stop-services]、daemon forget --dir DIR --confirm-orphan；命令之外的文本及缺参返回中文帮助／错误。

- [x] **步骤 1：锁定已核实的依赖版本。** 执行 npm install --save-exact --ignore-scripts --no-audit --no-fund @modelcontextprotocol/server@2.3.1 zod@4.6.5，再执行 npm install --save-dev --save-exact --ignore-scripts --no-audit --no-fund @modelcontextprotocol/client@2.3.1；未经过 SDK 握手测试不更换版本或宣称兼容。包名 springboot-launcher、version 0.1.0-alpha.1、private=true，bin 指向上述入口；不创建公开 npm 包。
- [x] **步骤 2：写失败测试。** 用 SDK 客户端及 STDIO 传输实际握手两个代理，消费 Task 5 的测试后台，验证完整八个工具、严格参数、错误、stdout 和共享状态：

```js
assert.deepEqual(toolNames.sort(),expectedEightToolNames.sort());
assert.equal(firstBackendId,secondBackendId);
assert.equal((await call('spring_boot_start',{dir,build:true})).isError,true);
assert.equal((await call('spring_boot_start',{dir})).structuredContent.ok,true);
assert.equal((await callFromSecond('spring_boot_status',{dir})).structuredContent.data.projectKey,key);
assert.equal(rawStdout.every(line=>isMcpFrame(line)),true);
```

- [x] **步骤 3：运行 node --test tests/mcp.test.mjs tests/cli.test.mjs，预期工具或命令行为失败。**
- [x] **步骤 4：实现接口。** SDK 负责协议协商，不手写 JSON-RPC；Tool 名称与设计八项完全一致，Zod 严格拒绝未知 build 等字段，业务校验仍由后台执行。错误结果带 isError=true，日志限制 100／1000 行、256 KiB。初始化 instructions 提醒先检查、无自动构建、后台共享及主动日志查询的数据边界。诊断只写 stderr，客户端断开只关闭代理。dashboard 返回或通过可注入的本机浏览器打开器打开 fragment 票据 URL，不把 BackendConnection 返回给模型。
- [x] **步骤 5：运行上述两份测试、node --test 及 node bin/springboot-launcher.mjs --help，预期握手、跨代理状态和帮助通过。**
- [x] **步骤 6：提交“功能：提供 Codex 和 Claude Code 共用的 MCP 与命令入口”。**

## Task 7：可打开操作的中文实时日志面板

**文件：** 新建 web/{index.html,styles.css,app.mjs,state.mjs}、tests/web-state.test.mjs；Task 4 的静态资源路由接入这些文件。

**接口：** 消费 Result、ServiceView、LogEvent 和上述接口。输出 createViewState({maxBytes=524288}) → 状态、reduceEvent(state,event) → 状态；app.mjs 完成票据交换、状态请求、操作和 EventSource 订阅。公开接口返回 data 的结构与 Task 6 相同，面板不另建服务注册表。

- [x] **步骤 1：写失败状态测试。** 覆盖旧事件、缺口、切换服务、字节限制、暂停与继续；暂停接收显示不停止后台采集：

```js
assert.equal(reduceEvent(state,duplicate).logs.length,state.logs.length);
assert.equal(reduceEvent(state,gap).gap,true);
assert.ok(Buffer.byteLength(reduceEvent(state,large).text)<=524288);
assert.equal(reduceEvent(paused,nextEvent).receivedSeq,nextEvent.seq);
```

- [x] **步骤 2：运行 node --test tests/web-state.test.mjs，预期状态行为失败。**
- [x] **步骤 3：实现中文面板。** 左侧项目／运行服务，右侧配置和日志；窄面板改为纵向排列。提供手动项目目录、受限扫描、Profile／JDK／端口／模式、开始／停止／重启及明确错误。票据兑换后清除 fragment，不保存控制凭据。日志用 textContent／文本节点显示；默认提供可切换跟随、暂停、当前缓冲搜索和复制，按钮反馈忙碌状态，运行与就绪标签区分。SSE 按序号重连，旧序号不重复追加，缺口在日志区明确显示。
- [x] **步骤 4：运行状态测试及 node --test，预期全部通过。**
- [x] **步骤 5：在实际浏览器打开 Task 5 的隔离测试后台，操作模拟服务验证启动／停止／重启、中文和含 HTML 的日志、暂停／搜索／复制、重连及窄面板。** 保存可公开截图和实际结果；测试后台标明模拟数据，不宣称真实 Java 已验收。不运行前端 build。
- [x] **步骤 6：提交“功能：增加中文服务管理与实时日志面板”。**

## Task 8：可复现安装、验证记录与开源交付

**文件：** 新建 docs/usage/{codex,claude-code,troubleshooting}.md、docs/verification/mvp.md、CHANGELOG.md、.github/workflows/test.yml、tests/package.test.mjs；更新 README、CONTRIBUTING、SECURITY、THIRD_PARTY_NOTICES、documentation 全组、发布清单和 package.json 的 files。

**接口：** 消费现有 CLI、八个 MCP 工具、实际锁文件和测试输出；输出两种客户端已验证配置、可公开发行清单、Windows CI 和事实验证记录，不生成不存在的远端链接。

- [x] **步骤 1：写失败发行测试。** 验证 files 清单包含 bin、src、web、权限脚本及许可证；运行 npm pack --dry-run --json --ignore-scripts 检查，不生成公开发布或执行 build：

```js
assert.ok(files.includes('bin/springboot-launcher.mjs'));
assert.ok(files.includes('web/index.html'));
assert.ok(files.includes('LICENSE'));
assert.equal(files.some(path=>/(node_modules|instance\.json|\.env|\.log$)/.test(path)),false);
```

- [x] **步骤 2：运行 node --test tests/package.test.mjs，预期缺少明确发行清单而失败。**
- [x] **步骤 3：实现交付材料。** 文档提供 git 源码安装、npm ci --ignore-scripts --no-audit --no-fund 和 MCP 接入步骤；使用可替换的公开示例路径。Codex 用 codex mcp add 指向 node 和绝对入口，CC 用 claude mcp add --transport stdio；不修改用户现有配置。Windows CI 用 Node.js 22.22.2、现有测试和忽略安装脚本，官方 action 锁定经过核对的修订。依赖及实际复制文件记许可、版本和来源，保留原版权；README 不把模拟子进程当作 Java 验收。
- [x] **步骤 4：运行 npm ci --ignore-scripts --no-audit --no-fund、npm test、上述发行清单检查及 CLI 帮助，确认输出并记录实际结果。** 核对公开文件及整个 Git 历史，不包含本地状态、控制票据、内部业务路径和真实日志。
- [x] **步骤 5：交付用户真实工程验收步骤。** 使用可信且由用户完成必要构建的工程：Codex 启动→网页日志→CC 查询停止→CC 启动→Codex 查询停止。记录真实结果或明确标为待验收，等待用户自行执行所需构建；不声称自动测试证明客户端已完成实机操作。
- [x] **步骤 6：完成一次整版独立代码审阅及必要修复，更新已知限制和检查清单；提交“交付：完善双客户端接入验证与开源发布材料”。** 不创建 GitHub 远端、不推送、不发布版本或 npm 包；真实验收和发布动作另行确认。

## 依赖依据与计划审阅

官方 SDK 当前稳定线为 v2，server／client 分包；版本和 Node 要求已经通过 npm 发布元数据读取核实。本计划使用 server／client 2.3.1、Zod 4.6.5，均满足 Node.js 22.22.2 基线。实现仍需安装锁定和协议测试，不能用元数据代替行为验证。

- [官方 SDK 仓库和 v2 说明](https://github.com/modelcontextprotocol/typescript-sdk)
- [server 包](https://www.npmjs.com/package/@modelcontextprotocol/server)
- [client 包](https://www.npmjs.com/package/@modelcontextprotocol/client)
- [Zod 包](https://www.npmjs.com/package/zod)

自检范围：设计第 1／6 节由 Task 4／5 覆盖，第 2／3 节由 Task 1／3 覆盖，第 4 节由 Task 6 覆盖，第 5 节由 Task 2／4／7 覆盖，第 7／8／9 节由 Task 8 及各任务验证覆盖。所有生产跨任务调用在上面的公共契约或接口块定义；测试注入不进入客户端配置或生产环境变量。

推荐由当前会话直接逐项实现，因为任务共享一组明确接口且依次依赖。实施时持续记录进度和验证，任务之间不再请求常规确认；整版完成后做一次独立审阅。若用户选择逐任务子代理，则使用对应技能的任务和审阅流程；任何执行方式均遵守当前工作树、构建和公开发布边界。
