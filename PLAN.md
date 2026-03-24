# Hibook 演进计划：打造类 Obsidian 的极客知识库

这份文档详细规划了如何将当前基于 Python + Docsify 的 `hibook` 命令行工具，分阶段演进为一个支持双向链接、知识图谱、实时编辑和桌面级体验的现代化个人知识管理（PKM）系统。为了保证项目的可持续发展，演进过程将严格遵循高内聚低耦合的工程规范。

## Phase 0: 基础设施大重构 (Infrastructure Refactoring)
*当前 `hibook` 的代码（尤其是 Python 脚本与前端 HTML）高度耦合，在引入复杂特性前必须先夯实地基。*

* **后端解耦**：将动辄 500+ 行的 `hibook.py` 重构为多个独立模块。
    * `hi_server.py`：专门处理 HTTP 服务与 REST API。
    * `hi_export.py`：专门管理向 PDF/Markdown 转换及资源爬取的繁重逻辑。
    * `hibook.py`：退化为纯粹的 CLI 核心调度层。
* **前端工程化**：废弃 `template/web/index.html` 中的“大杂烩”代码。
    * 引入 `assets/config.js` 管理全域设定。
    * 引入 `assets/theme.css` 与 `assets/plugins/*.js` 管理样式与生命周期插件，彻底实现模板的逻辑分离。

## Phase 1: 注入灵魂 —— 知识连接与时空脉络 (Links & Timeline)
*Obsidian 的核心精髓是知识的网状链接与生命周期，这也是 Docsify 缺失的短板，我们将在本阶段补齐。*

* **Git 时间线 (Git Timeline)**:
    * *后端*：在 `hi_server.py` 开放 `/_api/history?file=...` 接口，调用原生 Git Log 获取文档的提交哈希、作者与修改时间。
    * *前端*：编写独立的 Docsify 插件，在文章底部渲染一条按时间排序的修改轨迹（Timeline）。
* **双向链接 (Backlinks) 与 WikiLinks**:
    * 在构建或导出阶段，生成全局的文件引用清单。如果文档 A 链接了文档 B，则在文档 B 尾部展示“Linked Mentions”。
    * 修改渲染引擎以支持 `[[文档名]]` 这样的快捷双链语法。
* **知识图谱 (Graph View)**:
    * 构建全局关系 `graph.json`。通过接入 ECharts 或 D3.js，在网页端提供星空节点网络图，直观展示知识孤岛与枢纽。

## Phase 2: 分布式 Git 原生编辑 (Distributed Git-Centric Editor)
*围绕 Git 重新设计交互逻辑，让 Hibook 彻底进化为分布式的个人知识生产力工具。*

* **底层知识主权与架构规约 (Data Sovereignty & Architecture)**：
    * 坚持"零外部黑盒依赖"原则。
    * 新建 `ARCH.md` 来锚定项目的依赖管理与演进规则。要求所有前端库（如 CodeMirror 编辑器核心，ECharts 等）必须手动 Vendor 到本地 `assets` 极简分发，杜绝 CDN 加载。
* **Git 同步原语服务化 (Git Synchronization Mechanics)**: 
    * 将编辑器触发的保存动作无缝下沉为 Git 的细粒度版本控制（`POST /_api/save` 执行底层的物理文件重写和 `git commit` 本地持化）。
    * 追加原生云端同步 API接口（`POST /_api/sync` 执行 `pull --rebase` 与 `push`）。
* **引入零依赖编辑器与冲突拦截 UI**: 
    * 提供浏览器双端一致的互动式写作支持。
    * 当 `_api/sync` 探知多端读写冲突时，提供最低沉浸损耗的 UI 机制：极简的双路选择（“强制覆写为本地版本” 或 “丢弃本地追平云端”）。

## Phase 2.5: 历史版本高级控制 (Historical Version Controls)
*在现有的 Git 时间线基础上，赋予用户针对单个变更的精确控制权，并直白区分本地与云端状态。*

* **云端同步标识**: 在历史时间线上，通过对比 `@{u}..HEAD` 直观标记尚未 Push 到远程仓库的提交记录（Unsynced）。
* **直接版本回充 (Restore Version)**: 允许在阅读历史版本时，拉取该版本的快照并覆盖当前文件，实现类似 Obsidian 的“恢复此版本”功能。
* **撤销精准变更 (Undo Commit)**: 允许用户针对尚未 Push 的修改，执行精准的 `git revert`，在时间线留下撤销记录，同时逆转该次 Commit 引发的内容变化。

## Phase 3: 元数据与毫秒级全域搜索 (Metadata & Search)
*大规模知识累积后的刚需是分类与检索。*

* **YAML Frontmatter 解析**: 让系统能理解每篇 Markdown 文件顶部的元数据区（如 `tags`, `aliases`, `created`）。
* **侧边栏资源管理器重构**: 引入动态文件树面板，支持前端右键新建、拖拽改变文件目录结构，并由系统自动修正受影响的相对链接。
* **极速桌面级检索**: 引入 Whoosh 等轻量级 Python 本地倒排索引库。在 Web 端实现类似 `Ctrl+p` 的 Command Palette，支持通过文件名、标签和全文的秒级复合检索。

## Phase 4: 降维打击 —— 全局多路复用中枢 (Global Multiplexing Hub)
*完成从 “单库静态服务器” 到 “多并发动态门户” 的终极蜕变。*

> **⚠️ 进化分歧 (Evolution Pivot)**: 原计划采用 Tauri 或 PyWebView 强行将 Python 后端包裹进 Native App 里。但实践证明，GUI 原生的 `confirm/alert` 弹窗会灾难性地冻结 Python Daemon 主事件循环（详见 `DEV_GUIDE.md`）。因此全面转向基于纯 `hi_server` 挂载原生虚拟路径映射的 **Web Hub Dashboard**。

* **Daemon 守护进程化**: 抛弃单个知识库独占进程的设计。系统支持 `hibook start -p 3007` 启动全局唯一中枢后台。
* **聚合调度面板**: `http://localhost:3007/` 原生托管一份美观的纯前端控制台（Hub Dashboard），使得软件可以在单个端口内轻松支持工作区的动态创建（Scaffold）、挂载与安全销毁。
* **Mac 原生菜单栏集成 (Native Menu Bar App)**: 利用零依赖的 Swift JIT 将 `hibook hub` 编译为原生无痕的后台常驻菜单栏程序，抛弃浏览器的新标签页跳出，实现贴合系统的独立桌面级 Dashboard 体验。
* **原生 UI 重建**: 所有弹窗、通知均使用纯 HTML/CSS 脱离操作系统 Native 线程直接在 DOM 注入，彻底斩断 GUI 阻塞死锁。

## Phase 5: Frontend Spaghetti Eradication (Zero-Dependency Modularization)
*在坚持“零外部构建工具”（不引入 NPM / Vite）的前提下，实现前端视图层代码的现代化重构。*

- **Status:** **Completed**
- **Goal:** Tame the growing complexity of frontend DOM manipulation (`dashboard.js`, `hi_mermaid.js`, etc) without introducing external build step dependencies.
- **Strategy:** Migrating from pure global script-tag monolithic code to **Native Browser ES Modules (`<script type="module">`)**. Isolating UI features strictly using raw **Web Components (`customElements.define`)** accompanied by Shadow DOM for style/event encapsulation. This guarantees our zero-dependency geek philosophy while curing the spaghetti lifecycle nightmare natively within the browser.
