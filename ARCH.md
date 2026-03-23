# Hibook 核心架构与维护规约 (Architecture & Maintenance Guidelines)

这不仅是一份架构说明，更是维系 Hibook "**完全自主，分布式，且极客**" 愿景的最高指导原则。在进行任何代码修改或引入新组件之前，必须确保遵守本文件定义的所有约束。

---


## 一、 架构原则 (Architectural Principles)

### 1. 零外部黑盒依赖 (Zero Third-Party Dependency Rule)
* **绝对离线可用**：所有核心功能（文档解析、知识图谱绘制、语法高亮、交互式编辑器等）在断网环境下必须 100% 正常运行。
* **拒绝 CDN 运行时加载**：严禁在 `index.html` 或任何插件中直接通过 `https://cdn...` 或 `unpkg` 引入任何 JS/CSS 文件。
* **本地化 Vendor**：凡不得不引入的前端第三方能力（如 Mermaid, ECharts, CodeMirror 等），**必须且仅允许**获取其完全开源的源码压缩包（或单体构建 `min.js`），将其物理存放于 `template/web/assets` 或相关的 `vendor/` 目录下并通过本地相对路径加载。

### 2. "一切皆纯文本与 Git" (Everything is Text & Git)
* **无私有数据库格式**：Hibook 的本质是一个运行在静态 Markdown 和 Git 仓库之上的服务进程。永远不要引入 SQLite、MongoDB、MySQL 等独立数据库层。一切关系网络（双向链接、图谱数据）均在系统启动或被访问时，从底层 Markdown 文件及当前 Git Commit 即时衍生与计算。
* **以 Git 为交互中枢**：所谓的"云端同步"并不是基于自研云服务器同步协议，而是完全暴露出底层的 Git 操作。保存本质上就是 `Commit`，同步本质上就是 `Pull & Push`。

### 3. 高内聚与职能隔离 (Decoupled Responsibilities)
* **`hibook.py`**: 纯粹的入口与命令行解析中心（CLI），支持守护进程的启停（start/stop）以及文档库的创建与导出。
* **`hi_server.py`**: 核心后台守护进程（Daemon）。基于多路复用（Multiplexing）架构，全机器上仅需占用并监听一个固定端口（默认 3000）。通过动态的 URL 前缀命名空间（如 `/kb_name/`）进行多知识库的路由隔离与 API 沙盒限定。根路径 `/` 原生托管聚合所有激活空间状态的 **Web Dashboard Hub**。
* **`hi_export.py`**: 负责系统级的离线导出及静态文件的硬编排能力。
* **`hi_search.py` (新增)**: 全局 SQLite 收录与检索引擎，在各个工作区的沙箱内利用原生 `sqlite3` 提供毫秒级全文检索。
* **`template/web/assets/`**: 知识界面（阅读器、编辑器、图谱）的实体承载区，前端逻辑彻底插件化并收敛于独立的 `.js` 中，绝不在 `.html` 里写入大段脏逻辑。依赖原生 `fetch` 与 `hi_server` 的 `_api/` 端点通信进行读写。
* **`template/hub/` (新增)**: Web Dashboard Hub 的前端承载面，直接被 `hi_server.py` 在根目录渲染，负责整体仓库面板的发起调用、路径注册与销毁等聚合管理任务。

---

## 二、 交互层与存储层面的约定 (Interaction & Storage)

### 1. 分布式的单节点心智
任何一个 Hibook 实例在开启服务时，对当前终端就具有绝对写权限。如果系统遭遇因多端协同带来的内容不同步，解决方针极简至上：不要求复杂的行级三方差异 Merge，只需让终端使用者直接宣誓该节点主权（“全盘按照本机” 或 “全盘按照云端”）。

### 2. 全域配置隔离 (Global Config Separation)
当进入多库共管阶段时，任何属于“桌面端应用本身”的用户级配置（如最近打开的库、全局默认主题偏好等），严禁污染各个知识库目录内部！
必须强制调用 `hi_basic.hi_config.HiConfig`，将配置序列化为 JSON 稳妥地持久化保存在操作系统的 Default User Directory（用户家目录）下。

### 3. 依赖更新规约
若必须升级现有 `vendor` 下的前端资源版本：
1. 始终通过开源途径拉取对应稳定版的最新代码。
2. 代码存盘于特定 `assets` 后，必须伴随通过本项目的静态预检与重混淆测试（在浏览器控制台中），并同步在此文件中登记该库的版本以及引用点。

---

## 三、 当前核心 Vendor 清单
以下是本项目自带的内置库概览与功能承载：
* `docsify.min.js`: 用于承载静态解析生命周期与基础排版的 SPA 核心。
* `mermaid.min.js (v9.4.3)`: 用来满足 Markdown 内联图灵完备图表渲染的引擎。
* `katex.min.js`: 强大的 LaTeX 纯本地原生公式引擎。
* `vue.css`: 统一的 UI 原子与骨架屏风格参考。
* `Docsify Custom Plugins`: 包含双向链接、连结网络图谱的各类私有 `.js` 增强插件。
