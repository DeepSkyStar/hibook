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

## Phase 2: 打破只读壁垒 —— 交互式编辑 (Interactive Editor)
*让 `hibook` 从一个阅读器进化为生产力工具。*

* **RESTful 写入层**: 为 Python 后端追加处理 `POST` / `PUT` 的存储逻辑。
* **引入 WYSIWYG 引擎**: 
    * 剥离单纯由 Docsify 承担的单向宣发形态。
    * 接入如 CodeMirror 6（Obsidian 同款引擎）或者 Milkdown，实现浏览器端的双屏/所见即所得动态编辑。用户的按键直接经由 API 同步修改本地物理 `.md` 文件。

## Phase 3: 元数据与毫秒级全域搜索 (Metadata & Search)
*大规模知识累积后的刚需是分类与检索。*

* **YAML Frontmatter 解析**: 让系统能理解每篇 Markdown 文件顶部的元数据区（如 `tags`, `aliases`, `created`）。
* **侧边栏资源管理器重构**: 引入动态文件树面板，支持前端右键新建、拖拽改变文件目录结构，并由系统自动修正受影响的相对链接。
* **极速桌面级检索**: 引入 Whoosh 等轻量级 Python 本地倒排索引库。在 Web 端实现类似 `Ctrl+p` 的 Command Palette，支持通过文件名、标签和全文的秒级复合检索。

## Phase 4: 降维打击 —— 桌面级原生应用化 (Desktop App)
*完成从 “CLI 工具 + 浏览器” 到 “Native App” 的终极蜕变。*

* **轻量级壳体打包**: 采用 Tauri 或是 PyWebView。把成熟的 Python 服务器和进化的极客前端包裹进一个独立的窗口 App 里。
* **系统级整合**: 使得软件可以直接监听系统全局快捷键、读取本地剪贴板图片直接粘贴保存到 `assets` 目录，并获得彻底离线的桌面端沉浸体验。
