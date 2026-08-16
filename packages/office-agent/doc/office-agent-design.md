# 办公智能体（Office Agent）架构与落地方案

> 本文档**基于 `coding-agent-architecture.md`**（同目录）所描述的 `coding-agent` 架构骨架撰写。核心思路：**不重写一套 agent 运行时**，而是直接以 `coding-agent` 为底座——复用它的 agent loop、工具系统、扩展系统、会话/压缩、远程 RPC 协议与多模式 I/O——把它的"代码工具"（read/bash/edit/write）**替换并扩展为"办公工具"**（WPS 操控、海报生成、HTML demo 生成），从而得到一个主攻 **WPS 三件套 / 海报 / HTML 展示 demo** 三大方向的办公智能体。
>
> 文档同时参考了公开网络调研（WPS 开放平台、主流 AI 绘图工具、AI 建站工具、企业办公智能体落地方案），用于校准技术选型与实现路径。它既可作为产品技术选型依据，也可作为复刻/实现的蓝图。

---

## 0. 一句话定位

**办公智能体 = `coding-agent` 底座 + 办公工具集 + 办公工作台。** 它以"对话式智能体"为交互外壳，把自然语言请求转化为三类可交付产物：

- **WPS 三件套**：文字（`.docx`）、表格（`.xlsx`）、演示（`.pptx`）的起草、排版、数据清洗、图表、摘要、格式标准化；
- **海报**：文生图 + 模板合成，输出 `.png` / `.pdf` 营销/活动海报；
- **HTML 展示 demo**：自然语言/草图 → 单文件可运行 HTML → 实时预览 → 多轮迭代 → 一键部署。

底座完全复用 `coding-agent`：`pi-agent-core`（agent loop / 会话 / 压缩 / 工具抽象）、`pi-ai`（LLM 网关）、`pi-tui`（开发者调试 UI）、`pi-protocol` + `pi-client`（远程会话，正是前端工作台 ↔ 后端 agent 进程分离的所需能力）、`pi-telemetry`（可观测）。**唯一需要新写的是"办公工具层"和"办公工作台（GUI）"。**

---

## 1. 总体架构（沿用 coding-agent 骨架）

### 1.1 为什么以 coding-agent 为底座

`coding-agent-architecture.md` §2/§3 已经证明这套骨架足够通用，办公智能体只需做"换工具、加 GUI"两件事：

| coding-agent 已有的能力 | 办公智能体如何复用 |
|---|---|
| `Agent` + agent loop（`StreamFn` 边界） | 完全复用：LLM 调用边界不变，只换底层工具 |
| 工具抽象 `ToolDefinition` / `AgentTool` 双形态 | 完全复用：每个办公能力都写成一个 Tool |
| 会话持久化 `SessionManager`（JSONL 分支树） | **重点复用**：一份报告的多个版本 = 分支树的多个叶子，天然支持"改一版/回退" |
| 压缩与分支摘要 `compaction` | 复用：长文档/长上下文超出窗口时自动摘要 |
| 扩展系统 `extensions` | 复用：第三方注入自定义办公工具 / 模板 / 家企业知识 |
| 三种模式 `interactive` / `print` / `rpc` | **改造复用**：interactive → 办公 Web 工作台；print → 批量 CLI；rpc → 嵌入业务系统 |
| 远程协议 `pi-protocol` + 客户端 `pi-client` | **重点复用**：前端 GUI 跑在浏览器/桌面，后端 agent 跑本地进程，正是 RPC 设计目标 |
| `pi-ai` 44 供应商网关 + OAuth | 完全复用：WPS/海报/HTML 工具额外需要的"图像/文档 API"密钥也走同一鉴权体系 |

### 1.2 Monorepo 结构（复用 + 新增）

在 `coding-agent` 现有 `packages/` 之外，**新增/改造**以下包（其余 7 个包原样复用）：

| 目录 | 包名（建议） | 角色 | 来源 |
|---|---|---|---|
| `coding-agent` | `@earendil-works/pi-coding-agent` | 主 CLI + SDK + 三种模式 + 扩展系统 | **复用**（改交互模式渲染层） |
| `agent` | `pi-agent-core` | agent loop / 会话 / 压缩 / 工具抽象 | **复用** |
| `ai` | `pi-ai` | LLM 网关 | **复用** |
| `tui` | `pi-tui` | 终端 UI（开发者/调试模式） | **复用** |
| `protocol` | `pi-protocol` | CBOR 远程协议 | **复用** |
| `client` | `pi-client` | 远程会话客户端 | **复用** |
| `telemetry` | `pi-telemetry` | 可观测 | **复用** |
| `office-tools` | `@your-org/office-tools`（新增） | **办公工具集**：wps-* / poster-* / html-* | **新写**（本文核心） |
| `office-gui` | `@your-org/office-gui`（新增） | 办公 Web 工作台（聊天 + 预览 + 产物列表） | **新写**（替代/补充 TUI） |
| `delivery` | `@your-org/office-delivery`（新增） | 交付物渲染/导出：OOXML 库、HTML→图片、文档导出 | **新写**（支撑工具层） |

> 结论：**7 个底座包零改动复用，只新增 3 个包**（office-tools / office-gui / delivery），再把 `coding-agent` 的交互渲染层从 TUI 换成 `office-gui`。这与"在 coding-agent 架构基础上做"完全吻合。

### 1.3 依赖关系图

```
                          coding-agent  (复用，改 interactive 渲染层)
                           │  cli → main → AgentSession → 三模式
       ┌──────┬───────────┼──────────┬──────────┬──────────┬──────────┐
       ▼      ▼           ▼          ▼          ▼          ▼          ▼
  pi-agent-core  pi-ai  pi-tui   pi-protocol  pi-client  office-tools  office-gui
  (loop/会话/    (LLM    (调试     (CBOR       (远程       (wps/poster/  (Web 工作台,
   ｜工具抽象)   网关)    UI)      协议)        客户端)      html 工具)    RPC 调用 client)
       │  │        │                                              │            │
       │  └─▶ pi-telemetry ◀── ai ──┘                            │            │
       └──▶ pi-ai ──▶ pi-telemetry                              │            │
                                                              delivery ◀──┘
                                                          (OOXML/渲染/导出)
```

coding-agent 中对各层的依赖变化（对比 `coding-agent-architecture.md` §1.1 的 import 统计）：

| 层 | 原 coding-agent | 办公智能体 | 说明 |
|---|---:|---:|---|
| `pi-agent-core` | 37 | ~37（不变） | 工具抽象被 office-tools 复用 |
| `pi-ai` | 76 | ~76（不变） | 新增图像/文档 API 也走其鉴权 |
| `pi-tui` | 71 | ↓（仅调试模式） | 用户主路径改用 office-gui |
| `pi-protocol` / `pi-client` | 2 / 1 | ↑（重点用） | office-gui 经 RPC 连后端 |
| `office-tools` / `delivery` / `office-gui` | 0 | 新增 | 本文核心新增 |

---

## 2. 办公智能体自身架构（改造点）

### 2.1 目录与构建

沿用 `coding-agent` 的 `package.json` 约定（`type: module`、ESM、`engines.node >= 22.19.0`）。新增包同样用 workspace 引用。构建沿用 `tsgo -p tsconfig.build.json` + `copy-assets`。

### 2.2 启动与运行流程（改造）

入口链与 `coding-agent-architecture.md` §2.2 相同，仅**模式分发**变化：

```
main()
  ├─ parseArgs() → resolveAppMode()
  ├─ SettingsManager.create()          // 新增"办公默认设置"：默认工具集=office
  ├─ createSessionManager()            // 复用：会话=办公文档项目
  ├─ createAgentSessionRuntime()
  │     └─ createAgentSessionServices()  // 注入 office-tools 而非 coding-tools
  │     └─ createAgentSession() → new AgentSession(...)
  └─ 分发到运行模式：
        interactive → new OfficeWorkbench(runtime)   // 改：Web/Electron GUI
        print      → runPrintMode(runtime, ...)       // 复用：批量脚本出文档
        rpc        → runRpcMode(runtime)              // 复用：被业务系统嵌入
```

### 2.3 三种运行模式（映射到办公场景）

| 模式 | coding-agent 原义 | 办公智能体映射 | 入口 |
|---|---|---|---|
| **interactive** | 终端 TUI | **办公 Web 工作台**（聊天 + 实时预览面板 + 产物列表，对标 bolt.new 界面） | `office-gui` |
| **print** | 一次性问答 | **批量 CLI**：脚本化批量生成文档/海报/demo（如"把 100 份合同摘要成表格"） | `modes/print-mode.ts`（复用） |
| **rpc** | 无头 JSON 协议 | **嵌入 API**：被企微/飞书/钉钉机器人、业务后台调用 | `modes/rpc/rpc-mode.ts`（复用） |
| **json** | JSON 事件流 | 复用：供前端/第三方消费事件 | `modes/json-event.ts`（复用） |

> interactive 模式**不再用 TUI 做主路径**（办公用户不是终端用户），但仍保留 TUI 作为开发者调试模式。`office-gui` 通过 `pi-client` + `pi-protocol` 连到本地后端 agent 进程——这正是 `coding-agent-architecture.md` §3.4/§3.5 已经设计好的远程会话能力，办公智能体**直接受益**。

### 2.4 ~ 2.14 核心抽象（全部复用，不复述）

`AgentSession`、`createAgentSession` SDK 工厂、扩展系统、会话管理（`SessionManager` JSONL 分支树）、压缩与分支摘要、模型运行时与鉴权、设置与资源管理、系统提示与导出、服务端 Harness、远程客户端——**这些在 `coding-agent-architecture.md` §2.4~§2.14 已详述，办公智能体原样复用**，仅两处语义微调：

- **会话 = 办公文档项目**：`SessionManager` 的分支树天然适合管理"一份报告的 v1/v2/v3 多个版本"，或"同一份数据导出成 docx/pptx/xlsx 三种形态"。
- **系统提示 = 办公领域提示**：`buildSystemPrompt()` 注入 WPS/海报/HTML 的领域指南与工具使用片段。

---

## 3. 三大方向能力设计（本文重点）

### 3.1 方向一：WPS 三件套（文字 / 表格 / 演示）

#### 3.1.1 能力地图

| 组件 | 自然语言能做的事 | 交付物 |
|---|---|---|
| **文字 Writer**（`.docx`） | 起草/续写、润色改写、排版规范化、长文档摘要、合同条款抽取、格式标准化（字体/行距/表头） | `.docx` / `.pdf` |
| **表格 Spreadsheet**（`.xlsx`） | 数据清洗、公式/函数生成、图表生成、透视表、条件格式、报表汇总 | `.xlsx` / `.csv` |
| **演示 Presentation**（`.pptx`） | 大纲→页面、主题一键生成、配图建议、演讲备注、版式调整 | `.pptx` |

> 参考：WPS AI 2.0 已实现的"Word 语音排版、Excel 自然语言生成图表、PPT 主题一键生成、PDF 百页自动摘要"，财务月报 8h→1.5h——说明这条路线商业验证充分。

#### 3.1.2 两条实现路径（来自 WPS 开放平台调研）

**路径 A：WPS 内嵌操控（所见即所得，依赖桌面端）**

- **加载项（Add-in）**：用 `WpsInvoke.InvokeAsHttp(type, name, func, params, cb)` 启动 WPS 应用，`type` 取值 `wps`(文字)/`et`(表格)/`wpp`(演示)。agent 把"操作指令"下发给加载项，加载项在 WPS 进程内执行。
- **JSA 宏（JavaScript for WPS）**：单文件宏、跨平台（Win/Mac/Linux）、零安装。两层自动化——① `FileSystem` API 读写任意文件；② 操作 Office 对象模型（Range / Worksheet / Paragraph / Slide），读写单元格、格式化段落、生成幻灯片。**这是 agent 最该利用的能力：生成 JSA 宏代码 → 注入 WPS 执行 → 拿到结果。**
- **服务端 OpenAPI**：组织云文档 50 API（上传/下载/复制/另存/权限）、通讯录 42、消息 30——用于"集中式文件管理"与"把产物回写到企业云文档"。
- **WebOffice Document Processing Teams SDK**：在自有 Web 应用里嵌入 WPS 编辑器（对标 office-gui 里的文档编辑区）。

**路径 B：文件级生成（后台批量，跨平台，可服务化）**

- 直接用 OOXML 库在 agent 进程里生成/修改文件：文字 `docx`、表格 `ExcelJS`、演示 `pptxgenjs`（Node 侧），或 Python 侧 `python-docx` / `openpyxl` / `python-pptx`。
- 配合 **LibreOffice headless** 做格式转换（docx↔pdf、xlsx↔csv 等）。
- 优点：可后台批量、可纳入 git/预览、不依赖用户装 WPS；缺点：不能 100% 还原 WPS 专有特性。

**选型建议**：以 **路径 B（文件级生成）为主路径**（可控、可预览、可服务化），**路径 A（内嵌 JSA 宏/加载项）为增强路径**（精修、需要 WPS 渲染时才用）。工具层统一抽象，调用方无感。

#### 3.1.3 工具抽象（借鉴 `AgentTool` 双形态）

```
WpsTool (AgentTool 实例)  ── 定义：createWpsToolDefinition
  ├─ target:  "docx" | "xlsx" | "pptx"
  ├─ operation: "create" | "read" | "update" | "format" | "summarize" | "chart" | "macro"
  └─ params:  { path, instruction, data?, template? }
```

- `office-tools/src/wps/writer-tool.ts`：`createWpsWriterTool` / `createWpsWriterToolDefinition`
- `office-tools/src/wps/sheet-tool.ts`：`createWpsSheetTool` / `createWpsSheetToolDefinition`
- `office-tools/src/wps/slide-tool.ts`：`createWpsSlideTool` / `createWpsSlideToolDefinition`
- `office-tools/src/wps/macro-tool.ts`：`createWpsMacroTool`（注入并执行 JSA 宏，路径 A）
- 底层渲染由 `delivery` 包的 OOXML 封装 + LibreOffice headless 支撑。

### 3.2 方向二：海报生成

#### 3.2.1 能力地图

自然语言 → 文生图（主题/风格/尺寸/文案）→ 出图 → 局部重绘 → **排版合成**（加标题/Logo/二维码/留白）→ 导出 `.png` / `.pdf`。

#### 3.2.2 工具集

| 工具 | 职责 | 底层 |
|---|---|---|
| `poster-generate` | 文生图 / 图生图 / 局部重绘 | AI 绘图 API（见选型） |
| `poster-compose` | 文字层 + 模板合成的精确排版 | `satori` / `sharp` / `canvas`（本地合成，文字可控） |
| `poster-template` | 模板库管理（社媒/促销/KV/活动头图） | 内置模板 JSON |

#### 3.2.3 选型（来自主流 AI 绘图工具调研，2025）

| 工具 | 厂商 | 适合场景 | 备注 |
|---|---|---|---|
| **即梦 AI** | 字节 | **默认文生图**：中文友好、无限画布+局部编辑、直出可用、免费+无限量 | 横评 ★★★★★，专业中文海报首选 |
| **通义万相** | 阿里 | 电商感/国风封面、质感高、中文提示稳定 | 复杂多角色稍弱 |
| **稿定 AI** | 稿定 | 模板工作台、半定制海报、文案联动 | 模板感强，个性化需二次美编 |
| **Canva 可画** | Canva | 海量模板、拖拽编辑 | 免费版受限、付费几十~几百/年 |
| **可灵 AI** | 快手 | 极速出图（~15s）、批量配图 | 提示词理解一般 |

**关键架构决策**：AI 文生图的**中文文字极不可靠**，海报正文/标题/二维码必须用本地合成层（`poster-compose` 走 `satori`/`sharp`）叠加——这正是稿定/创客贴"模板+编辑"的思路。即梦负责"出图"，本地合成层负责"出字"，二者解耦。

### 3.3 方向三：HTML 展示 demo

#### 3.3.1 能力地图

自然语言 / 草图 / 参考图 → 单文件 HTML（Tailwind 走 CDN，Vanilla JS 或 React 走 CDN）→ **实时预览**（沙箱 iframe）→ 多轮迭代 → 一键部署（静态托管）。

#### 3.3.2 工具集

| 工具 | 职责 | 底层 |
|---|---|---|
| `html-generate` | LLM 生成 HTML/CSS/JS（单文件优先） | `pi-ai` 流式 + 代码后处理 |
| `html-preview` | 本地预览服务 / iframe 沙箱 + 截图校验 | headless 浏览器（Playwright）截图回灌 LLM 修 |
| `html-deploy` | 部署到静态托管 | CloudStudio / Netlify / Vercel |

#### 3.3.3 选型（来自 AI 建站工具调研）

| 工具 / 思路 | 厂商 | 借鉴点 |
|---|---|---|
| **v0** | Vercel | 自然语言→React+Tailwind+shadcn 组件，UI 原型质量高（350 万用户） |
| **Bolt.new** | StackBlitz | WebContainers 浏览器内全栈运行 + 即时预览 + 一键部署 + **自动错误检测修复** |
| **Cursor / Windsurf** | — | 多文件编辑、代码库理解、精准改块 |
| **Lovable / Replit Agent** | — | 对话式全栈生成 |

**关键架构决策（对标 bolt.new）**：生成 → 预览 → 自动修复闭环。`html-preview` 用 headless 浏览器截图，把"渲染是否正常/console 报错"回灌给 `html-generate` 迭代。**单文件 HTML 优先**（零构建、易预览、易交付）；沙箱必须加 `iframe sandbox`，禁止盲目 `eval` 用户生成代码（安全红线）。

---

## 4. 工具系统设计（借鉴 coding-agent §2.6）

### 4.1 `ToolDefinition` / `AgentTool` 双形态（复用）

办公工具沿用 coding-agent 的"定义 + 实例"两套形态：`createXxxTool`（实例）与 `createXxxToolDefinition`（定义），统一经 `tool-definition-wrapper` 接入 agent。扩展系统（`defineTool`）可直接注册自定义办公工具。

### 4.2 办公工具清单（总表）

| 方向 | 工具 | 文件（建议） | 底层能力 |
|---|---|---|---|
| WPS | `createWpsWriterTool` | `office-tools/src/wps/writer-tool.ts` | OOXML / JSA 宏 / WebOffice |
| WPS | `createWpsSheetTool` | `office-tools/src/wps/sheet-tool.ts` | ExcelJS / 公式 / 图表 |
| WPS | `createWpsSlideTool` | `office-tools/src/wps/slide-tool.ts` | pptxgenjs |
| WPS | `createWpsMacroTool` | `office-tools/src/wps/macro-tool.ts` | JSA 宏注入（路径 A） |
| 海报 | `poster-generate` | `office-tools/src/poster/generate-tool.ts` | 即梦/通义万相/稿定 API |
| 海报 | `poster-compose` | `office-tools/src/poster/compose-tool.ts` | satori / sharp / canvas |
| 海报 | `poster-template` | `office-tools/src/poster/template-tool.ts` | 模板库 |
| HTML | `html-generate` | `office-tools/src/html/generate-tool.ts` | LLM 代码生成 |
| HTML | `html-preview` | `office-tools/src/html/preview-tool.ts` | headless 浏览器 + 沙箱 |
| HTML | `html-deploy` | `office-tools/src/html/deploy-tool.ts` | 静态托管 API |

### 4.3 交付物管理（`delivery` 包）

统一产出可被 `office-gui` 预览、可被 `SessionManager` 记录、可被 `export-html` 归档的产物：

- `.docx` / `.xlsx` / `.pptx`（WPS 三件套）
- `.png` / `.pdf`（海报，PDF 由 sharp/pdf-lib 合成）
- 单文件 `index.html` / 可部署站点（HTML demo）

---

## 5. 会话、压缩与版本分支（复用 coding-agent §2.8/§2.9）

- **`SessionManager`（JSONL 分支树）用于"多版本文档"**：一次"帮我写季度报告"可以产生多个分支——v1 精简版、v2 详细版、v3 配图版，用户可在分支树里导航/回退。这是 coding-agent 已有能力在办公场景的**自然放大**。
- **`compaction` 用于长文档上下文**：上传百页 PDF / 大表格时，自动摘要压入上下文，避免溢出（复用 `_checkCompaction` 逻辑）。
- **持久化**：会话文件即"办公项目文件"，可重开、可续写、可 fork。

---

## 6. 落地 / 构建建议

### 6.1 构建顺序（借鉴 coding-agent §4.1）

1. **复用底座 7 包**（agent / ai / tui / protocol / client / telemetry / coding-agent）——**零改动**。
2. **`delivery` 包**：封装 OOXML 库、LibreOffice headless、satori/sharp、文档导出。工具层依赖它。
3. **`office-tools` 包**：按 §4.2 实现 10 个工具（WPS 4 + 海报 3 + HTML 3）。先实现"路径 B 文件级生成"与"海报合成"与"HTML 单文件生成"三条最快见效的主路径。
4. **`office-gui` 包**：Web/Electron 工作台，经 `pi-client`+`pi-protocol` 连后端；聊天 + 预览面板 + 产物列表。
5. **改造 `coding-agent` 交互模式**：把 interactive 从 TUI 切到 office-gui；print/rpc/json 模式原样复用。
6. **系统提示与模板**：在 `resource-loader` 注入办公领域系统提示、海报模板库、WPS 对象模型速查。

> 不碰 `server` / `session-backends/sqlite-node` / `evals`（与 coding-agent 同理，不在依赖链上）。

### 6.2 技术选型清单（来自网络调研，可直接对接）

- **LLM 网关**：`pi-ai` 已含 44 供应商，国内可用 deepseek / qwen / kimi / moonshot / 智谱 等。
- **WPS 自动化**：开放平台 `open.wps.cn`（服务端 OpenAPI + JSAPI + 加载项 + WebOffice SDK）；JSA 宏做内嵌精修。
- **海报文生图**：即梦 AI（默认）/ 通义万相 / 稿定 / Canva；文字走 satori/sharp 本地合成。
- **HTML demo**：LLM 生成单文件 HTML + Playwright 预览校验 + 静态托管（CloudStudio/Netlify/Vercel）。
- **参考竞品架构**：钉钉 DEAP（模型-数据-技能-应用 四环节）、飞书 My AI、WPS AI 2.0、文心智能体、腾讯混元——均为"多智能体 + 多工具联动"（接入层/核心层/数据层/工具层/安全层），印证本方案分层合理。

### 6.3 四个容易踩的坑

1. **WPS 路径取舍**：不要一上来押注"加载项/内嵌 JSA 宏"（部署 publish.xml、Mac WPS 加载项兼容性问题多）。先把"路径 B 文件级生成"跑通，再用 JSA 宏做增强。
2. **海报中文文字**：绝不可指望文生图出准确中文。所有正文/标题/二维码必须走 `poster-compose` 本地合成层。
3. **HTML 预览沙箱安全**：`html-preview` 必须用 `iframe sandbox`，禁止盲目 `eval` 生成的代码；截图校验胜过直接执行。
4. **复用 `StreamFn` / `compat` 约定**：LLM 调用继续走 `pi-ai/compat` 的 `streamSimple`/`stream`/`completeSimple` + `setDefaultStreamFn` 兜底（见 coding-agent-architecture.md §4.3），不要重写 LLM 调用层。

---

## 7. 参考（网络调研来源）

- WPS 开放平台：`https://open.wps.cn/`（服务端 OpenAPI、客户端 JSAPI/JSSDK、WebOffice SDK、加载项开发、`WpsInvoke.InvokeAsHttp`）
- WPS JSA 宏帮助中心：`https://open.wps.cn/docs/client/js-macro/`（跨平台单文件宏、FileSystem API + Office 对象模型）
- AI 绘图横评（即梦/通义万相/稿定/Canva/可灵）：即梦 AI 无限画布+局部编辑、通义万相质感、稿定模板工作台、Canva 模板、可灵极速
- AI 建站工具（v0 / Bolt.new / Cursor / Windsurf / Lovable / Replit Agent）：v0 的 React+Tailwind 组件、Bolt.new 的 WebContainers+即时预览+一键部署+自动修复
- 企业办公智能体落地：钉钉 DEAP、飞书 My AI、WPS AI 2.0、文心智能体平台、腾讯混元 Agent、ModelEngine 多智能体+多工具联动架构

---

## 8. 附：核心类型速查（在 coding-agent 基础上新增）

| 概念 | 来源 | 说明 |
|---|---|---|
| `AgentMessage` / `StreamFn` / `AgentTool` | pi-agent-core（复用） | agent 循环货币 / LLM 边界 / 工具实例 |
| `SessionSnapshot` / `TranscriptItem` | pi-protocol（复用） | 前端工作台 ↔ 后端 agent 的远程快照 |
| `WpsTool` / `poster-*` / `html-*` | office-tools（新增） | 三大方向的办公工具 |
| `DeliveryArtifact` | delivery（新增） | 统一交付物（docx/xlsx/pptx/png/pdf/html） |
| `OfficeWorkbench` | office-gui（新增） | Web 工作台，替代 interactive 的 TUI 渲染 |

---

*文档生成方式：以同目录 `coding-agent-architecture.md` 的架构骨架为基底，结合对 WPS 开放平台、主流 AI 绘图工具、AI 建站工具、企业办公智能体落地方案的公开网络调研整理而成。重点回答"办公智能体怎么做"——复用底座、替换工具、新增 GUI 与交付层，主攻 WPS 三件套 / 海报 / HTML 展示 demo 三大方向。*
