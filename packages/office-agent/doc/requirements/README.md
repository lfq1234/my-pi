# 办公智能体（office-agent）· 需求文档集（自底向上实现）

> 本目录是 `office-agent-design.md`（同目录上层）的**具体需求分解**。设计文档回答"做什么 / 怎么选型"，本目录回答"**分阶段具体实现什么、接口长什么样、怎么验收**"。
>
> **核心定位（务必先读这一段）**：办公智能体是**参照 `coding-agent` 架构新建的一个 agent 项目（兄弟包）**。
> - **底层"基础引擎"** = `coding-agent-architecture.md` §3 详解的那套 `pi-*` 共享包（`pi-agent-core` / `pi-ai` / `pi-tui` / `pi-protocol` / `pi-client` / `pi-telemetry`）。这套引擎**原样复用，不重造**——你"看不懂基础引擎"没关系，先去读 §3 把每个包"提供什么 / 该怎么 import"搞清楚，然后照着 coding-agent 在 §2 里消费它们的方式一模一样地消费即可。
> - **新建的 `office-agent` 包** 在结构上**镜像 coding-agent 的内部组织（架构文档 §2.1–2.14）**，只是把"编码"领域换成"办公"领域（WPS 三件套 / 海报 / HTML 展示页）。
> - **`coding-agent` 本身一个字都不改**——它只是我们的"官方范例 / 参考实现"，用来知道"一个建立在 `pi-*` 引擎之上的 agent 包到底长什么样、引擎怎么接"。

## 0. 一句话对应关系（← 架构文档）

office-agent 与 coding-agent 是**并列的两个 agent 包**，都建在同样的 `pi-*` 引擎之上：

| coding-agent（参考实现，架构文档 §2） | office-agent（新建，镜像结构） | 关系 |
|---|---|---|
| §1 Monorepo 里的一个包 | 同为新包，依赖同批 `pi-*` | **镜像** |
| §2.1 目录/构建（`package.json` + 6 个 `pi-*` 依赖） | 新 `package.json`，依赖同批 `pi-*`，bin 名改 `office` | **镜像** |
| §2.2 启动流程（`cli.ts` / `main.ts`） | 新 `cli.ts` / `main.ts` | **镜像** |
| §2.3 三种运行模式（interactive / print / rpc） | 同三种模式；interactive 可选换成 Web 工作台 | **镜像 + 可选增强** |
| §2.4 `AgentSession` / §2.5 `createAgentSession` SDK | 新 `core/agent-session.ts` / `core/sdk.ts`，默认注入办公工具 | **镜像** |
| §2.6 **工具系统** `read/bash/edit/write` | **换领域**：`wps_writer / wps_sheet / wps_slide / poster_* / html_*` | **只换这一层** |
| §2.7 扩展系统（pi-agent-core 提供） | 复用同一扩展机制（新 agent 同样支持扩展） | **复用** |
| §2.8 `SessionManager` 分支树 / §2.9 compaction | 复用 pi-agent-core | **复用** |
| §2.10 `ModelRuntime` / 鉴权 | 复用 pi-ai | **复用** |
| §2.11 资源管理 / §2.12 **系统提示** | **换领域**：指向办公模板 / 办公提示 | **只换这一层** |
| §2.13 Harness 桩 | 可选复用同一约定 | **复用 / 可选** |
| §2.14 `RemoteSession` / `./client` | 后端实现同协议，前端复用 `coding-agent/client` 的 `RemoteSession` 连 | **复用协议** |

> **两句话总结**：
> ① **引擎（§3 的 `pi-*` 包）原样复用，不重造**——它怎么 `import Agent`、怎么 `setDefaultStreamFn(streamSimple)`，你就怎么来；
> ② **新 agent 的"领域层"（工具 + 系统提示）从"编码"换成"办公"**，其余内部结构（§2）照着 coding-agent 搭。

## 1. 复用边界（不可逾越）

| 类别 | 内容 | 处理方式 |
|---|---|---|
| **必须复用（禁止重造）** | 6 个 `pi-*` 基础引擎包（架构文档 §3 逐个详解） | 先读 §3 搞清每个包"提供什么 / 该怎么 import"，再照 coding-agent 在 §2 的消费方式一模一样地消费 |
| **镜像复用（照抄结构）** | coding-agent 自身内部组织（§2.1–2.14） | 直接照它的文件划分与调用方式搭新包，别自己瞎设计 |
| **必须新建（换领域）** | `office-agent` 包本体 + 办公工具（`core/tools/`） + 办公系统提示内容 | 这是"换领域"的全部代码量 |
| **可选新建** | `office-delivery`（工具依赖的渲染库薄封装，对应 coding-agent 用 `docx` 等第三方库）、`office-gui`（Web 工作台，替代 TUI） | 按需，非核心 |

> 唯一会"多出来"的第三方库封装是 `office-delivery`（docx / pptxgenjs / satori / sharp…）——它和 coding-agent 在工具里 `import "docx"`、用 `bash` 调外部程序一样，是**工具内部的依赖**，不是新架构层。

## 2. 自底向上路线图

| Phase | 文档 | 本阶段新增 | 对应架构文档 | 可交付验证 |
|---|---|---|---|---|
| **0** | `phase-0-base-reuse.md` | 读懂引擎（§3）；搭 `office-agent` 空包骨架（依赖同批 `pi-*`，镜像 §2.1） | §1 / §3 | 包能 `install` + 空跑 |
| **1** | `phase-1-delivery.md` | `office-delivery` 渲染库（OOXML / satori 合成…）——**仅是工具依赖** | §2.6（工具内部可用任意库） | 生成 test.docx / test.png（带中文文字层） |
| **2** | `phase-2-office-tools.md` | 办公工具（`core/tools/`，形态同 coding 工具，注入默认工具集） | §2.6 / §2.5 | LLM 调出 docx / html |
| **3** | `phase-3-office-gui.md` | `office-gui` Web 工作台（可选）：聊天流 + 预览 + 产物列表，复用 `RemoteSession` 连后端 | §2.14 | 浏览器预览对话产物 |
| **4** | `phase-4-mode-switch.md` | `office-agent` 自有 `cli.ts` / `main.ts` 三模式入口（镜像 §2.2/§2.3） | §2.2 / §2.3 | `office` 命令进工作台 |
| **5** | `phase-5-deepen.md` | 三方向深化：JSA 宏、即梦出图、Playwright 校验+部署（**叠加新工具**） | §2.6 | WPS 精修 / 海报出图 / HTML 自动修+部署 |
| **6** | `phase-6-prompts-templates.md` | 办公系统提示 + 海报模板库 + WPS 对象模型速查（换 §2.12 内容） | §2.11 / §2.12 | 提示注入后输出质量提升 |

## 3. 渐进原则

- **引擎不重造，领域才换**：每个阶段都不重写 `pi-*` 引擎；新增的"办公工具 / 提示"与 coding-agent 自带的 `read/bash/edit/write` / coding 提示**是同一种东西**，只是领域不同。
- **每阶段独立验收**：完成 phase-N 后运行其"可交付验证"，通过再进下一阶段。
- **接口稳定优先**：下层对外暴露的 TS 接口（`DeliveryArtifact`、`AgentTool` 等）一旦定稿，后续只扩展、不破坏。
- **新功能叠加**：phase-5 的"即梦接入""Playwright 校验"是在 phase-2 工具基础上**新增**工具，而非重写。
- **复用设计文档坑清单**：WPS 不先押加载项、海报文字本地合成、HTML 沙箱安全、`StreamFn/compat` 约定——贯穿所有阶段。

## 4. 文档阅读顺序

1. 本 README（定位 + §0 对应关系）
2. `phase-0-base-reuse.md`（**先搞懂引擎**） → `phase-1-delivery.md` → `phase-2-office-tools.md`
3. `phase-3-office-gui.md` → `phase-4-mode-switch.md`
4. `phase-5-deepen.md`（三方向深化） → `phase-6-prompts-templates.md`

> 与架构文档 §4 复刻顺序一致：先吃透引擎（§3）→ 照着 coding-agent（§2）建一个新 agent → 工具 → 前端 → 入口 → 深化 → 提示。
> **区别仅在于**：复刻 coding-agent 是"从零复刻引擎本身"，而办公智能体是"引擎已现成，照着 coding-agent 建一个**领域不同的兄弟 agent**"。
