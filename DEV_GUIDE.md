# Hibook 开发者指南与架构避坑笔记
> *这份权威的复盘文档记录了在开发 Hibook v2.0 (全局多路复用中枢架构) 期间，我们所受到的架构约束、踩过的暗坑以及最终确立的技术范式。*

如果你是辅助开发的 AI 助手，或者未来准备扩展此项目的开发者，在修改核心服务器 Daemon (后台守护进程) 或前端插件逻辑之前，**你必须首先阅读并完全理解这份文档**。

## 1. 物理沙盒隔离与路径穿透陷阱 (The Global Multiplexing Sandboxing Leak)
**踩坑原由**：我们将 `hi_server.py` 从一个简单的单库本地 HTTP 服务器，升级成了支持多路复用 (Multi-tenant) 的全局 Hub 后台。前端原本可以通过 `window.HIBOOK_ROOT` (例如 `"/{workspace_name}/"`) 来发送请求。然而，Python 后端的 `subprocess.run(["git", ...])` 和 `open()` 文件操作最初都错误地默认依赖了 `os.getcwd()` 作为当前执行目录。
**严重后果**：这导致 Hub Daemon 在执行用户的 Markdown 保存编辑或是 Git Push 的时候，直接把文件写进了 **Daemon 自身的源码执行目录**（即 `hibook` 仓库），这甚至物理覆盖掉了系统本身的 `README.md`。
**铁律 (The Absolute Rule)**：
* 所有的 API 接口 (`/_api/save`, `/_api/sync` 等) MUST (必须) 通过 `os.path.join(physical_dir, file_path)` 将前端传来的相对路径解析到正确的物理工作区去。
* 所有的 Shell 交互 (Shell interaction) MUST (必须) 显式绑定 `cwd=physical_dir`。在 Hibook 中，我们已经通过覆写 `subprocess.run` 并绑定线程安全的 `_route_context.cwd` 来强制约束环境。**绝对不要绕过 `_wrapped_run`，更不要在 Git 命令中漏传 CWD。**

## 2. 搜索引擎数据库的全局单例锁死 (The Global Singleton Database Lockout)
**踩坑原由**：在 `hi_search.py` 中，早期的 `SearchManager` 使用了标准的 `_instance = None` 全局单例模式。
**严重后果**：第一条请求搜索接口 `/_api/search` 的知识库（通常是首先被打开的库），会触发自己目录下的 SQLite Schema 初始化逻辑（例如生成 `hibook/.hibook_web/hibook_index.db`）。由于这是一个严格的全局唯一单例，随后由 Multiplexer (多路复用器) 挂载的其他**任何子知识库**，都会永远查询这**同一个单例持有的旧数据库**。这导致其他知识库中的搜索请求返回的永远是第一个仓库的结果，造成了诡异且灾难性的数据交叉。
**铁律 (The Absolute Rule)**：
* 在构建 Multi-Tenant (多租户) 的长驻后台时，单例组件必须按租户的作用域进行隔离。在 Python 中，必须使用如 `_instances = {}` 这样的字典池（Dictionary Pool），将单例按照 `root_dir` 或是 `tenant_id` 加锁映射，而不是仅仅在类层级保留唯一的 `_instance`。

## 3. PyWebView 阻塞型原生弹窗导致的主线程死锁 (The PyWebView Native Modals Death Spiral)
**踩坑原由**：早期为了给用户确认提示（比如删除工作区之前），我们直接在前端调用了浏览器原生的 `confirm()` 或是 `alert()` API。
**严重后果**：当 Hibook 被 `hi_desktop.py` 通过 `pywebview` 打包为桌面端视窗时，在 Javascript 内部触发 `confirm()` 这种挂起循环的系统调用，会直接冻结整条 Python 的 Master UI 事件循环 (Event Loop)，因为 WebView 的拦截钩子本质上并不是异步 GUI 线程。这会直接导致软件假死变砖 (Bricked)。
**铁律 (The Absolute Rule)**：
* **绝对不要使用任何浏览器自带的阻塞级系统对话框。** 必须永远自行实现纯 HTML/CSS/DOM 构建的自定义全屏遮罩弹窗（例如 `dashboard.js` 中实现的 `promptDelete`），使用 Javascript 回调 (.then) 异步消费用户的交互，切不可阻塞 JS 执行机制。

## 4. 前端路由的根路径依赖 (Frontend Routing - The `window.HIBOOK_ROOT` Paradigm)
**踩坑原由**：在编写前端的 JavaScript 插件时，发出的接口请求直接硬编码使用了绝对根路径 `fetch("/_api/...")`。
**严重后果**：因为重构后 Hibook 的各个工作区是被挂载至多路复用器的子路径下的（比如 `http://localhost:3000/my_note/`）。绝对路径 `/` 的 Fetch 会直接让浏览器剥离掉 `my_note` 命名空间，导致接口 404 或者被错误地路由回了 Hub 根仓库。
**铁律 (The Absolute Rule)**：
* 所有在 UI 侧发出的 REST API 调用都安全地使用 `(window.HIBOOK_ROOT || '/')` 前缀。
* 正确的写法示范：`fetch((window.HIBOOK_ROOT || '/') + '_api/save')`。

## 5. 移动端 UI 侧边栏事件冒泡冲突 (UI Event Collisions on Mobile)
**踩坑原由**：在移动端视图下，Docsify 原生的左侧栏逻辑是：点击屏幕的任何地方都会立即为 body 追加 `.close` class，强行把侧边栏收起。因此，如果在侧边栏里添加了我们自己的自定义按钮，用户点击时，会优先触发 Docsify 全局绑定的收起逻辑。
**严重后果**：点击插件按钮的一瞬间，侧边栏直接原地消失，而且按键触发事件极易错发或被屏蔽。
**铁律 (The Absolute Rule)**：
* 必须在事件的【捕获阶段】 (Capture Phase) 正确拦截冒泡。我们在 `index.html` 的底层引入了一个专属的 **Mobile Sidebar Shield (移动端侧栏护盾)**，监听了 MutationObserver。在触发我们的专属自定义功能期间，利用该“护盾”强行阻止被剥夺 `.close` 样式，保证自定义组件生命周期安全。
