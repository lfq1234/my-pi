# Phase 0 · 读懂基础引擎 + 搭 office-agent 空包骨架

> **阶段目标（两条，缺一不可）**：
> 1. **读懂基础引擎**：把 `coding-agent-architecture.md` §3 详解的 6 个 `pi-*` 包"提供什么 / 该怎么 import"吃透。你"看不懂基础引擎"没关系——本阶段就是专门让你把它读明白，然后照着 coding-agent 在 §2 里消费它们的方式一模一样地消费。
> 2. **搭出 `office-agent` 空包骨架**：镜像 coding-agent 的 `package.json`（同批 `pi-*` 依赖）与目录结构（§2.1），但**不写任何业务逻辑**。本阶段产出 = 一个能 `install`、能空跑的新 agent 包。
>
> ⚠️ **复用原则（用户强调）**：基础引擎（`pi-*`）一律**引用，不要另起一套**；外面的包（包括 `coding-agent` 的 `./client`）已经提供了完整的远程会话能力与协议定义，GUI 直接复用，禁止自己捏造类型名 / 方法名。

---

## 1. 基础引擎速查表（摘自架构文档 §3，本阶段必读）

office-agent 要消费的引擎 = coding-agent 直接依赖的那 6 个 `pi-*` 包。下表是"消费视角"压缩版，逐条对应架构文档 §3.1–3.6：

| 包（引擎） | 提供什么（office-agent 要用到的） | 怎么 import（与 coding-agent 一致） | 架构文档 |
|---|---|---|---|
| `@earendil-works/pi-agent-core` | `Agent` 类 + agent loop、`SessionManager`（JSONL 分支树）、`compaction`、扩展系统、`AgentTool` / `ToolDefinition` 双形态、`tool-definition-wrapper` / `wrapRegisteredTools` | `import { Agent, ... } from "@earendil-works/pi-agent-core"` | §3.1 |
| `@earendil-works/pi-ai` | 统一 LLM 网关、`streamSimple` / `stream` / `completeSimple`（在 `/compat` 子路径），`ModelRuntime` / `AuthStorage` | `import { setDefaultStreamFn, streamSimple } from "@earendil-works/pi-ai/compat"` | §3.2 |
| `@earendil-works/pi-tui` | 终端 UI（TUI）组件树、Kitty 键盘协议；仅 interactive 模式（TUI）用到，Web 工作台不用 | `import { ... } from "@earendil-works/pi-tui"` | §3.3 |
| `@earendil-works/pi-protocol` | CBOR 编解码 + 长度前缀分帧 + TypeBox schema（`SessionSnapshot` / `TranscriptItem` / `ServerEvent` / `Command` / `details` 开放字段） | `import type { ... } from "@earendil-works/pi-protocol"` | §3.4 |
| `@earendil-works/pi-client` | `PiClient` + `ByteTransport` + `transportFactory`（远程连接客户端底座） | `import { PiClient, ByteTransportFactory } from "@earendil-works/pi-client"` | §3.5 |
| `@earendil-works/pi-telemetry` | `TelemetryContext` / `TelemetrySpan` 契约（传递依赖，一般直接用默认实现） | `import { ... } from "@earendil-works/pi-telemetry"` | §3.6 |

> **本阶段验收点 1**：能对着上表，在 `office-agent` 里写出 6 行 `import` 且不报错——证明"引擎看懂了、会用了"。

## 2. 新包骨架（镜像 coding-agent §2.1）

`office-agent/package.json` 的依赖**与 coding-agent 同批**（架构文档 §1 / §3），仅 bin 名不同：

```jsonc
// office-agent/package.json（骨架，镜像 coding-agent）
{
  "name": "@your-org/office-agent",
  "version": "0.1.0",
  "type": "module",
  "bin": { "office": "./dist/cli.js" },   // 镜像 coding-agent 的 bin: pi
  "dependencies": {
    "@earendil-works/pi-agent-core": "0.84.2",
    "@earendil-works/pi-ai": "0.84.2",
    "@earendil-works/pi-protocol": "0.84.2",
    "@earendil-works/pi-client": "0.84.2",
    "@earendil-works/pi-tui": "0.84.2",       // 仅 TUI 模式用到
    "@your-org/office-delivery": "0.1.0"       // phase-1 产出（工具依赖库）
  },
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/client/index.js"       // 镜像 coding-agent 的 ./client，供 office-gui 连
  }
}
```

目录结构**镜像 coding-agent §2.1**（先建空文件占位，phase-2/4 再填肉）：

```
office-agent/
├── package.json
├── src/
│   ├── cli.ts                 # 镜像 §2.2 入口（phase-4 填）
│   ├── main.ts                # 镜像 §2.2 主流程（phase-4 填）
│   ├── index.ts               # 顶层重导出（镜像 §2.7 的 defineTool 等）
│   ├── core/
│   │   ├── index.ts           # 镜像 §2.4/2.5 装配
│   │   ├── sdk.ts             # createAgentSession —— 默认注入办公工具（phase-2/4 填）
│   │   ├── agent-session.ts   # 镜像 §2.4 AgentSession
│   │   ├── tools/             # ★ 换领域：office 工具（phase-2 填）
│   │   ├── extensions/        # 镜像 §2.7 扩展系统
│   │   ├── session-manager.ts # 复用 pi-agent-core
│   │   ├── model-runtime.ts   # 复用 pi-ai
│   │   ├── settings-manager.ts# 镜像 §2.11（指向办公资源）
│   │   ├── resource-loader.ts # 镜像 §2.11
│   │   └── compaction/        # 复用 pi-agent-core
│   ├── modes/                 # 镜像 §2.3 三种模式（phase-4 填）
│   └── client/                # 镜像 §2.14 导出 RemoteSession（供 office-gui）
└── out/                       # 产物落盘目录
```

> **本阶段验收点 2**：`npm install` 成功；`node dist/cli.js --help`（空实现）能跑——证明"骨架搭对了、引擎依赖装上了"。

## 3. 前后端连接契约（GUI ↔ 后端，真实 API，禁止捏造）

`office-gui`（phase-3）要连的是 **office-agent 自己的后端进程**。后端实现 RPC server 的方式**镜像 coding-agent 的 `modes/rpc`**（复用 `pi-protocol` 的 codec），前端则**直接复用 `coding-agent` 导出的 `RemoteSession` 客户端**（因为协议是同一套 `pi-protocol`，客户端可通用）。

真实的客户端 API（来自 `coding-agent/client`，架构文档 §2.14）——**GUI 只调这些，不另写传输层**：

```typescript
// office-gui 连后端（真实 API，非伪代码）
import { PiClient, ByteTransportFactory } from "@earendil-works/pi-client";
import { RemoteSession } from "@earendil-works/pi-coding-agent/client"; // coding-agent 的 ./client 子路径

const client = await PiClient.connect({ transportFactory: () => new ByteTransportFactory() });
const session = await RemoteSession.create(client, { cwd: process.cwd() });

session.submit("帮我写一份季度总结 docx");          // 发消息（替代任何自创 sendUserMessage）
session.subscribe((state) => {                       // 收对话流：transcript 归约已内置
  render(state.transcript);                          // state.transcript: TranscriptItem[]
});
```

底层类型全部来自 `pi-protocol`（架构文档 §3.4），**不新增协议类型**：
- `TranscriptItem`（user / assistant / tool 三类）—— 对话流
- `ToolTranscriptItem.details`（`JsonValue` 开放字段）—— **办公产物就挂这里**（见下）
- `SessionSnapshot` / `ServerEvent` / `Command` —— 快照与命令

### 3.1 办公产物约定（唯一的新增量，挂 `details`）

工具产出的 `docx / xlsx / pptx / png / pdf / html` 要能到达前端。复用 `pi-protocol` 的 `details` 开放字段（不破坏 schema）：

```typescript
interface ArtifactRef {            // 办公领域唯一新增的"值类型"，挂 ToolTranscriptItem.details
  kind: "docx" | "xlsx" | "pptx" | "png" | "pdf" | "html";
  path: string;                   // 后端绝对/相对路径
  previewUrl?: string;            // 可选：静态服务后的预览地址
  label: string;
}
// 工具运行时把 run() 返回的 artifact 写入：
//   toolTranscriptItem.details = { artifacts: ArtifactRef[] };
// GUI 用 extractArtifacts(state.transcript) 读取（phase-3 细化）
```

### 3.2 传输适配（极薄桥，非协议）

若 GUI 跑在浏览器、后端是本地进程，需一层**仅做传输转发**的极薄 WebSocket 桥（把 `pi-protocol` 的字节流在 `ws` 与 `stdio`/`unix` 间搬运），**不定义任何新类型、不碰协议语义**。

## 4. 验收标准（AC）

- [ ] AC-0.1 能对着 §1 引擎速查表，在 `office-agent` 写出 6 个 `pi-*` 的 `import` 且不报错（引擎读懂）。
- [ ] AC-0.2 `office-agent` 包 `npm install` 成功，`bin: office` 可空跑（骨架正确，依赖同批 `pi-*`）。
- [ ] AC-0.3 目录结构镜像 coding-agent §2.1（关键占位文件齐备）。
- [ ] AC-0.4 `office-gui` 能用 `coding-agent/client` 的 `RemoteSession` 真实 API 连上"一个会说话的桩后端"（验证连接契约，不验证业务）。

## 5. 里程碑与退出条件

- **退出条件**：引擎读懂（§1 表能默写）、空包骨架可装可跑、前后端连接契约用真实 API 验证过。
- 本阶段**不写任何办公业务逻辑**；之后 phase-1 补工具依赖库、phase-2 填 `core/tools/`、phase-4 填 `cli/main/modes`。
- **坑提醒**：受管 `npm` 默认 prefix 指向 workspace 而非项目本地，装项目依赖须 `--prefix "C:/绝对路径"` 才会落到 `office-agent/node_modules`，否则 ESM 解析裸模块名失败（`NODE_PATH` 对 ESM 无效）。
