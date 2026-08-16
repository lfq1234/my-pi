# Pi Coding Agent（`coding-agent`）架构文档

> 本文档基于 `C:\Users\LENOVO\Desktop\my-pi\packages` 下的真实源码逐包阅读整理，目标是：**讲清楚 `coding-agent` 这个项目本身做了什么、怎么组织的，以及它依赖的同仓库（`packages/` 下）其它代码具体依赖了什么、完成了什么功能、在哪里被使用**。文档可直接作为开源复刻（re-implementation）的蓝图。

---

## 0. 一句话定位

`coding-agent` 是 `pi` 这个 AI 编码助手的**主 CLI 包**（npm 名 `@earendil-works/pi-coding-agent`，可执行名 `pi`，版本 `0.84.2`，MIT，作者 Mario Zechner / Earendil Works）。它本身**不实现 LLM 调用、不做终端渲染、不做底层 agent 循环**，而是把这些能力拆到同仓库的若干兄弟包里，自己专注于：

- 把底层 agent 运行时、LLM 网关、终端 UI 组装成一个“编码智能体”；
- 提供**三种运行模式**：交互式 TUI、一次性/管道 `print`、无头 `rpc`（JSON 协议）；
- 提供**会话持久化（JSONL 分支树）、上下文压缩（compaction）、分支摘要、模型/思考级别切换、自动重试**等高级能力；
- 通过一套**扩展系统（extensions）**让第三方注入自定义工具、命令、UI、钩子。

---

## 1. 仓库整体结构（Monorepo）

`packages/` 是一个 pnpm/npm workspace，所有包版本统一为 `0.84.2`，互相通过 `@earendil-works/pi-*` 的包名引用。

| 目录 | 包名 | 角色 | coding-agent 是否直接依赖 |
|---|---|---|---|
| `coding-agent` | `@earendil-works/pi-coding-agent` | 主 CLI + SDK + 三种运行模式 + 扩展系统 | （自身） |
| `agent` | `@earendil-works/pi-agent-core` | 通用 agent 运行时：agent loop、transport 抽象、状态管理、附件、会话持久化、内置工具、压缩 | ✅ 直接 |
| `ai` | `@earendil-works/pi-ai` | 统一 LLM API：供应商目录、模型发现、鉴权/OAuth、内容类型、流式调用 | ✅ 直接 |
| `tui` | `@earendil-works/pi-tui` | 终端 UI 库（差异化渲染、组件模型、键盘/输入处理、原生模块） | ✅ 直接 |
| `protocol` | `@earendil-works/pi-protocol` | 传输无关的 CBOR 协议 + 字节流分帧（用于远程会话） | ✅ 直接（仅 `client/` 子模块） |
| `client` | `@earendil-works/pi-client` | 传输无关的远程会话客户端（基于分帧 CBOR） | ✅ 直接（仅 `client/` 子模块） |
| `telemetry` | `@earendil-works/pi-telemetry` | 供应商中立的可观测性契约 + 类型化 schema 工具 | ⏺ 传递依赖（经 agent-core / ai） |
| `server` | `@earendil-works/pi-server` | 实验性 pi server（远程会话服务端） | ❌ 不依赖 |
| `session-backends/sqlite-node` | `@earendil-works/pi-session-backend-sqlite-node` | SQLite 会话后端（替代 JSONL） | ❌ 不依赖 |
| `evals` | （评估脚本包） | 评测/基准脚本 | ❌ 不依赖 |

> 结论：**`coding-agent` 直接依赖 5 个兄弟包**（agent、ai、tui、protocol、client），并通过它们**间接依赖 telemetry**。其余 `server` / `session-backends` / `evals` 与本包无依赖关系（coding-agent 自带一套 JSONL `SessionManager`，没有用 SQLite 后端）。

### 1.1 依赖关系图

```
                         coding-agent  (@earendil-works/pi-coding-agent, bin: pi)
                          │  cli.ts → main.ts → AgentSession → 三种模式
       ┌──────────┬───────┼───────────┬──────────┬──────────────┐
       ▼          ▼       ▼           ▼          ▼              ▼
  pi-agent-core  pi-ai  pi-tui   pi-protocol  pi-client      (自身 client/)
  (agent loop,   (LLM    (TUI     (CBOR       (远程会话       RemoteSession
   Session,      网关,   渲染)    协议+分帧)   客户端)          客户端)
   tools,        models,                                    │
   compaction)   auth)                                        └─ 依赖 ─┐
       │  │          │                                            │      │
       │  └─依赖──▶ pi-telemetry  ◀──────── pi-ai 也依赖 ─────────┘      │
       └─依赖──▶ pi-ai ──依赖──▶ pi-telemetry                              │
                  │                                                         │
                  └─ pi-protocol（ai 不依赖，protocol 只依赖 typebox）──────┘
```

coding-agent 源码中对各兄弟包的 import 次数（统计 `src/`）：

| 包 | import 次数 | 主要使用位置 |
|---|---:|---|
| `@earendil-works/pi-agent-core` | 37 | `core/sdk.ts`、`core/agent-session.ts`、`server/create-harness.ts`、`core/extensions/loader.ts` |
| `@earendil-works/pi-ai` | 76 | 几乎全工程（流式调用、模型/类型/鉴权） |
| `@earendil-works/pi-tui` | 71 | `modes/interactive/**`、部分工具渲染、CLI 启动 UI |
| `@earendil-works/pi-protocol` | 2 | `src/client/remote-session.ts`、`src/client/transcript.ts` |
| `@earendil-works/pi-client` | 1 | `src/client/remote-session.ts` |
| `@earendil-works/pi-telemetry` | 0（直接） | 经 agent-core / ai 间接使用 |

---

## 2. Coding-Agent 自身架构

### 2.1 目录与构建

- `package.json`：`bin: { "pi": "dist/cli.js" }`，`main: ./dist/index.js`，`type: module`（ESM）。
- 三个导出入口：`"."`（SDK/公共 API）、`"./rpc-entry"`（`pi` 的 RPC 入口，等价于 `pi --mode rpc`）、`"./client"`（远程会话客户端 `RemoteSession`）。
- `configDir: ".pi"`，`engines.node >= 22.19.0`。
- 构建：`tsgo -p tsconfig.build.json` 编译后，`npm run copy-assets` 把交互模式的主题 JSON、资源 PNG、HTML 导出模板复制进 `dist/`；`build:binary` 还会用 `bun build --compile` 打成单文件可执行。

### 2.2 启动与运行流程

入口链：

```
dist/cli.js (src/cli.ts)
  └─ configureHttpDispatcher()        // 配置 undici 全局 dispatcher（代理/超时）
  └─ main(process.argv.slice(2))

main() (src/main.ts)
  ├─ 处理 auth 子命令（/login、/check、凭证打印）
  ├─ handlePackageCommand / handleConfigCommand（包管理、配置命令）
  ├─ parseArgs()                       // cli/args.ts：解析全部 CLI 参数
  ├─ resolveAppMode()                  // 决定 interactive / print / rpc / json
  ├─ runMigrations()                  // 迁移（认证供应商等）
  ├─ SettingsManager.create()          // 全局/项目设置
  ├─ createSessionManager()            // 新建/恢复/继续/分支会话
  ├─ createRuntime 工厂 → createAgentSessionRuntime()
  │     └─ createAgentSessionServices()   // 组装 services（settings、modelRuntime、resourceLoader、extensions）
  │     └─ createAgentSessionFromServices() → createAgentSession() → new AgentSession(...)
  └─ 分发到运行模式：
        interactive → new InteractiveMode(runtime).run()
        print      → runPrintMode(runtime, ...)
        rpc        → runRpcMode(runtime)   // 或 rpc-entry 直接 --mode rpc
```

### 2.3 三种运行模式（`src/modes/`）

| 模式 | 触发 | 入口 | 说明 |
|---|---|---|---|
| **interactive** | TTY 且无管道输入（默认） | `modes/interactive/interactive-mode.ts` | 全功能 TUI 聊天界面，基于 `pi-tui` |
| **print** | `--print`、管道 stdin、或非 TTY | `modes/print-mode.ts` | 一次性问答，文本/JSON 输出，适合脚本 |
| **rpc** | `--mode rpc` 或 `rpc-entry` | `modes/rpc/rpc-mode.ts` | 无头 JSON 协议：stdin 收命令、stdout 发事件，供宿主程序嵌入 |
| **json** | `--mode json` | `modes/json-event.ts` | 与 print 类似，但输出 JSON 事件流 |

三种模式**共用同一个 `AgentSession`**（`core/agent-session.ts`），区别只在最外层的 I/O 层。

### 2.4 核心抽象：`AgentSession`（`core/agent-session.ts`）

这是整个包**最核心的类**，被所有模式共享。它把底层的 `Agent`（`pi-agent-core`）包成带“会话生命周期 + 持久化 + 扩展 + 压缩 + 重试”的更高级封装。

关键职责：

- **状态访问**：`state`、`model`、`thinkingLevel`、`messages`、`sessionFile`、`sessionId`、`isStreaming`、`isIdle`。
- **事件订阅**：`subscribe(listener)` 转发 `AgentEvent` 并补充 coding-agent 自有事件（`agent_end`、`queue_update`、`compaction_start/end`、`thinking_level_changed`、各种 `auto_retry_*`、`bash_execution_update` 等）。
- **提示（prompt）**：`prompt()`、`steer()`（打断式插入）、`followUp()`（排队式）；支持图片附件、扩展命令（`/xxx`）、skill 命令（`/skill:name`）、prompt 模板展开。
- **模型/思考级别**：`setModel()`、`cycleModel()`（Ctrl+P 循环，`--models` 指定范围）、`setThinkingLevel()`、`cycleThinkingLevel()`，均会 clamp 到模型能力并持久化。
- **压缩**：`compact()`（手动）、自动压缩（`_checkCompaction`，溢出/超阈值触发）、分支摘要。
- **队列模式**：`setSteeringMode()` / `setFollowUpMode()`（`all` / `one-at-a-time`）。
- **持久化钩子**：在 `message_end` 时把消息写进 `SessionManager`，自定义消息写 `CustomMessageEntry`。
- **扩展桥接**：在 `Agent` 上安装 `beforeToolCall` / `afterToolCall` 钩子，把工具调用/结果转给 `ExtensionRunner`；在 `prepareNextTurnWithContext` 中注入每轮系统提示。

`AgentSession` 的 `AgentSessionConfig` 接收：`agent`（`pi-agent-core` 的 `Agent`）、`sessionManager`、`settingsManager`、`cwd`、`scopedModels`、`resourceLoader`、`customTools`、`modelRuntime`、`initialActiveToolNames`、`allowedToolNames` / `excludedToolNames`、`extensionRunnerRef`、`sessionStartEvent`。

### 2.5 SDK 工厂：`createAgentSession`（`core/sdk.ts`）

对外暴露的程序化入口。要点：

- 解析/恢复模型与思考级别（优先 session 记录 → settings 默认 → `findInitialModel`）。
- 构造 `convertToLlm` 包装（支持 `blockImages` 设置，把图片替换为占位文本）。
- 构造 `Agent` 时传入：
  - `streamFn`：内部调用 `modelRuntime.streamSimple(model, context, {...})`（见 §5.2）；
  - `convertToLlm`、`onPayload`（`before_provider_request` 钩子）、`onResponse`（`after_provider_response` 钩子）、`transformContext`（扩展 `emitContext`）、`steeringMode` / `followUpMode` / `transport` / `thinkingBudgets` / `maxRetryDelayMs`（均来自 `SettingsManager`）。
- 模块加载时执行 `setDefaultStreamFn(streamSimple)`：给不显式传 `streamFn` 的扩展代码提供默认流函数（保持 0.81 之前行为）。
- 返回 `{ session, extensionsResult, modelFallbackMessage }`。

### 2.6 工具系统（`core/tools/`）

coding-agent 自带一套工具工厂（“coding tools”），默认启用 `read / bash / edit / write`，并提供只读组合 `read / grep / find / ls`。每个工具都有“定义（Definition）”和“实例（Tool）”两种形态：

- `read.ts`、`bash.ts`、`edit.ts`、`write.ts`、`grep.ts`、`find.ts`、`ls.ts`：分别导出 `createXxxTool`（实例）与 `createXxxToolDefinition`（定义）。
- `edit-diff.ts`：精确文本替换 + 统一 diff 补丁生成（`generateDiffString` / `generateUnifiedPatch`）。
- `file-mutation-queue.ts`：`withFileMutationQueue` 串行化同路径写入，避免并发覆盖。
- `truncate.ts`：`truncateHead` / `truncateTail` / `truncateLine` + `formatSize`，用于大输出截断。
- `render-utils.ts`：工具结果渲染辅助（图片能力探测、超链接等）。
- `tool-definition-wrapper.ts`：把 `AgentTool` 包装成 `ToolDefinition`，供扩展系统消费。
- `core/tools/index.ts` 汇总：`createTool` / `createToolDefinition` / `createCodingTools` / `createReadOnlyTools` / `createAllTools` / `createCodingToolDefinitions` / `createReadOnlyToolDefinitions` / `createAllToolDefinitions`，以及 `ToolName` 联合类型与 `allToolNames`。

> 重要区分：coding-agent 在 **SDK 默认模式**下用的是自己 `core/tools/` 里的工厂；而在 **harness/服务端模式**（`server/create-harness.ts`）下，直接用 `pi-agent-core` 的 `createBashTool/createEditTool/createReadTool/createWriteTool`（见 §5.1）。

### 2.7 扩展系统（`core/extensions/`）

这是 coding-agent 的“插件总线”，让第三方包（`.ts` 文件、npm 包、内联工厂）注入：

- **生命周期钩子**：`before_agent_start`、`agent_start/end`、`turn_start/end`、`message_start/update/end`、`tool_call`、`tool_result`、`input`、`context`、`after_provider_request/response`、`before_provider_headers`、`session_before_compact`、`session_compact`、`model_select`、`thinking_level_select`、`project_trust` 等。
- **自定义工具**：`defineTool()` 注册 `ToolDefinition`，由 `wrapRegisteredTools()` 包成 `AgentTool` 接入 agent。
- **命令**：`pi.registerCommand()` 注册斜杠命令（`/xxx`），在 `prompt()` 中以 `/` 开头时优先执行。
- **UI 上下文**：`ExtensionUIContext`（select/confirm/input/editor/notify/setWidget/setTitle…），在 interactive 模式下走 TUI，在 rpc 模式下走 JSON `extension_ui_request`。
- **资源加载**：`DefaultResourceLoader`（`core/resource-loader.ts`）扫描 extensions、skills（`SKILL.md`）、prompt templates、themes、context files、系统提示片段，并按项目信任（project trust）决定是否启用。
- **沙箱注入**：`core/extensions/loader.ts` 通过 `jiti` 加载扩展，并把整个 `@earendil-works/pi-agent-core`、`pi-ai`、`pi-tui` 等作为虚拟模块（`_bundledPiXxx`）注入扩展运行时，使扩展可以 `require("@earendil-works/pi-tui")` 等。

顶层 `index.ts` 把扩展相关类型与函数全部重导出（`ExtensionFactory`、`ExtensionAPI`、`ExtensionContext`、`ExtensionRunner`、`defineTool`、`discoverAndLoadExtensions` 等），供二次开发。

### 2.8 会话管理与持久化（`core/session-manager.ts`）

coding-agent **自带**一个 JSONL 追加写（append-only）会话存储（`SessionManager`），不依赖 `pi-agent-core` 的 `JsonlSessionRepo`（但复用其 entry/record 词汇）：

- 支持 `create` / `open` / `continueRecent` / `forkFrom` / `inMemory` / `list` / `listAll`。
- 维护**分支树（branch tree）**：每条消息是一个 `Entry`，会话是一棵可按节点 fork/导航的树（`getTree()`、`getLeafId()`、`navigateTree()`）。
- Entry 类型：`SessionMessageEntry`、`CustomMessageEntry`、`CompactionEntry`、`BranchSummaryEntry`、`ModelChangeEntry`、`ThinkingLevelChangeEntry`、`SessionInfoEntry` 等。
- 原子发布（`.tmp` + rename）+ 尾部损坏修复；`buildSessionContext()` 从叶子回溯构造 `AgentMessage[]`（尊重压缩/分支摘要/自定义 entry 投影）。
- `CURRENT_SESSION_VERSION` 与 `migrateSessionEntries()` 做版本迁移（`migrations.ts`）。

### 2.9 压缩与分支摘要（`core/compaction/`）

- 直接**重导出** `pi-agent-core` 的压缩引擎：`compact`、`prepareCompaction`、`shouldCompact`、`estimateTokens`、`estimateContextTokens`、`calculateContextTokens`、`findCutPoint`、`findTurnStartIndex`、`generateSummary`、`generateSummaryWithUsage`、`getLastAssistantUsage`、`collectEntriesForBranchSummary`、`generateBranchSummary`、`DEFAULT_COMPACTION_SETTINGS` 等。
- `core/compaction/index.ts` 在此之上做**编排**：准备鉴权（`_getSummarizationRequestAuth`）、把请求转给 `modelRuntime.streamSimple`/`completeSimple`、写入 `CompactionEntry`、重建 agent 上下文。
- 自动压缩触发逻辑在 `AgentSession._checkCompaction`：检测 `isContextOverflow`（上下文溢出）或 `isRecoverableLength`（输出被截断且可恢复），溢出且非 `stop` 时压缩后自动重试一次；超阈值则压缩但不重试。

### 2.10 模型运行时与鉴权（`core/model-runtime.ts`）

- `ModelRuntime.create()` 封装 `pi-ai` 的 `Models` + `ModelsStore`（模型目录持久化） + 凭据存储（`AuthStorage`，基于 `pi-ai` 的 `CredentialStore`）。
- 暴露 `getAuth()`、`checkAuth()`、`hasConfiguredAuth()`、`isUsingOAuth()`、`getAvailableSnapshot()`、`refresh()`、`setRuntimeApiKey()` 等。
- `model-resolver.ts`：`resolveCliModel` / `resolveModelScope` / `findInitialModel`，配合 `modelsAreEqual`、`clampThinkingLevel`、`getSupportedThinkingLevels`（来自 `pi-ai`）。
- CLI 鉴权：`cli/auth-check.ts`、`cli/auth-command.ts`、`core/runtime-credentials.ts`、`core/auth-storage.ts` 处理 `/login`、`/check`、凭证打印。

### 2.11 设置与资源管理（`core/settings-manager.ts`、`core/resource-loader.ts`）

- `SettingsManager`：全局（`~/.pi/agent`）+ 项目（`cwd/.pi`）两级作用域，管理模型/思考级别/工具默认/压缩/重试/HTTP 代理/主题/传输/密钥等；支持诊断排水（`drainErrors`）。
- `DefaultResourceLoader`：统一加载扩展、skills、prompt templates、themes、context files、系统提示，并产出 `systemPrompt` / `appendSystemPrompt` / `skills` / `agentsFiles` 供 `buildSystemPrompt()` 使用。

### 2.12 系统提示与导出

- `core/system-prompt.ts`：`buildSystemPrompt()` 把 cwd、skills、context files、工具片段/指南、自定义提示拼成最终系统提示。
- `core/export-html/`：把会话导出为独立 HTML（`exportFromFile`、`exportSessionToHtml`），自带 vendor 模板与代码高亮。
- `modes/interactive/theme/`：主题系统（`theme.ts`、`theme-controller.ts`），主题 JSON 在构建时复制到 `dist/theme/`。

### 2.13 服务端/Harness 模式（`server/create-harness.ts`）

`createCodingAgentHarness()` 用 `pi-agent-core` 的 **`AgentHarness`** 构造一个持久化编排器：

- 把 `createReadTool/createBashTool/createEditTool/createWriteTool`（来自 agent-core，泛型 `ExecutionToolContext`）包装成 `CodingAgentHarnessTool`（附加 `promptSnippet` / `promptGuidelines` / `constrainedSampling`）。
- 用 `AgentHarness.create({ session, tools, activeToolNames, systemPrompt, ... })` 创建；bash 工具的 `prepare` 钩子会注入 `PI_SESSION_ID` / `PI_SESSION_FILE` / `PI_PROVIDER` / `PI_MODEL` / `PI_REASONING_LEVEL` 等环境变量。
- `buildCodingAgentHarnessSystemPrompt()` 复用 coding-agent 的工具系统提示片段。

> 注意：`AgentHarness` 在当前版本里大量操作方法是“契约 + 错误类型桩”（多数抛 `HarnessNotImplemented`）。coding-agent **实际运行用的是 `Agent` + `SessionManager`**，而非 `AgentHarness`。`createCodingAgentHarness` 是为“服务端/持久化编排”预留的前瞻接口。

### 2.14 远程会话客户端（`src/client/`，导出 `./client`）

coding-agent 自带一个 `RemoteSession` 客户端，用于连接一个**独立的 pi server 进程**（例如实验性的 `@earendil-works/pi-server` 或 `pi server`）。它正是 `pi-protocol` 与 `pi-client` 两个兄弟包的唯一使用方（见 §5.4、§5.5）。

---

## 3. 依赖的同包代码：逐个详解

下面每一节都回答三件事：**① 这个包提供什么；② coding-agent 具体 import 了哪些符号；③ 这些符号在 coding-agent 里完成了什么功能、怎么用。**

---

### 3.1 `@earendil-works/pi-agent-core`（`agent/`）

**① 它是什么**
通用、供应商无关的 agent 运行时。核心能力：

- **Agent 类 + 底层 agent loop**（`Agent`、`agentLoop`、`agentLoopContinue`、`runAgentLoop`）：一套“转换上下文 → 调 LLM（通过调用方提供的 `StreamFn`）→ 执行工具（并行/串行）→ 发事件 → 循环”的编排器。
- **transport 抽象**：`Transport` 类型只是被透传到底层 stream 函数/`pi-ai` 的供应商，agent 核心本身不打开任何 socket。
- **状态管理与附件**：`AgentState`、图片附件（`ImageContent`）、`steering`/`followUp` 队列。
- **持久化会话模型**：`Session`、`SessionStorage`、`InMemorySessionRepo`、JSONL 后端（`JsonlSessionRepo`/`JsonlSessionStorage`）、`SessionState`（追加写 mutation 日志）、lane/entry/record 词汇。
- **内置工具**：`createBashTool` / `createEditTool` / `createReadTool` / `createWriteTool`、`ExecutionEnv` / `NodeExecutionEnv`、`withFileMutationQueue`。
- **压缩与分支摘要**：`compact`、`prepareCompaction`、`generateBranchSummary` 等。
- **skills / prompt templates / 结果类型（`Result`/`TaggedError`）/ 遥测 schema（`AGENT_TELEMETRY_SCHEMAS` 等）**。
- **`AgentHarness`**：面向“持久化编排”的前瞻类（本版本多为桩）。

**② coding-agent 具体依赖的符号**

运行期（值）：
```ts
import { Agent, setDefaultStreamFn } from "@earendil-works/pi-agent-core";
// core/sdk.ts: new Agent({...})；模块加载时 setDefaultStreamFn(streamSimple)

import {
  AgentHarness, createBashTool, createEditTool, createReadTool, createWriteTool,
  type AgentHarnessOptions, type AgentHarnessTool, type ExecutionEnv,
  type ExecutionToolContext, type HarnessTool,
} from "@earendil-works/pi-agent-core";
// server/create-harness.ts: 构造持久化 harness + 内置工具

// core/extensions/loader.ts: 把整个模块作为虚拟包注入扩展沙箱
import * as _bundledPiAgentCore from "@earendil-works/pi-agent-core";
```

类型（`AgentMessage`、`ThinkingLevel`、`AgentEvent`、`AgentState`、`AgentTool`、`AgentToolResult`、`AgentToolUpdateCallback`、`ToolExecutionMode`、`PrepareNextTurnContext`、`StreamFn`、`ExecutionEnv`、`ExecutionToolContext`、`HarnessTool`、`AgentHarnessTool`、`AgentHarnessOptions`、`CustomAgentMessages`（声明合并于 `core/messages.ts`）等）散布于 `core/agent-session.ts`、`core/sdk.ts`、`core/extensions/*`、`modes/*`、`core/compaction/*` 等约 35 个文件。

**③ 完成的功与使用情况**

| 功能 | 使用方式 |
|---|---|
| **agent 循环 / 编排** | `core/sdk.ts` 构造 `new Agent({ initialState, convertToLlm, streamFn, onPayload, onResponse, transformContext, steeringMode, followUpMode, transport, thinkingBudgets, maxRetryDelayMs })`。`AgentSession` 在 `message_end` 后通过 `agent.continue()` 驱动后续轮次；steering/followUp 直接调 `agent.steer()` / `agent.followUp()`。coding-agent 在其上叠加持久化、扩展、压缩、重试。 |
| **默认流函数兜底** | `setDefaultStreamFn(streamSimple)`：扩展代码若构造 `Agent` 但不传 `streamFn`，仍能工作。 |
| **持久化会话词汇** | `Entry`/`Record`/`SessionStorage`/`SessionTree` 等类型被 coding-agent 的 `SessionManager` 复用（coding-agent 用自研 JSONL 实现，但沿用同一词汇）。 |
| **内置工具（harness 模式）** | `server/create-harness.ts` 用 `createBashTool/createEditTool/createReadTool/createWriteTool` + `ExecutionEnv` 构造 `CodingAgentHarnessTool`，注入 `AgentHarness`。 |
| **压缩/分支摘要** | `core/compaction/index.ts` 直接重导出并编排 `compact` / `generateBranchSummary` 等；`AgentSession.compact()`、`_checkCompaction()` 调用它们。 |
| **扩展沙箱** | 整个 `pi-agent-core` 模块被注入扩展运行时，扩展可 `require("@earendil-works/pi-agent-core")`。 |
| **`AgentHarness`（前瞻）** | 仅在 `server/create-harness.ts` 使用；当前运行路径走 `Agent` + `SessionManager`。 |

---

### 3.2 `@earendil-works/pi-ai`（`ai/`）

**① 它是什么**
统一的 LLM API 网关。核心：

- **供应商抽象**：`Provider<TApi>` + `Models` 注册表；44 个内置供应商（anthropic、openai、google、amazon-bedrock、deepseek、groq、mistral、qwen、kimi、moonshot、xai、openrouter、github-copilot…）。每个供应商把“厂商怪癖”隔离到 `src/api/*`（线协议，如 `anthropic-messages`、`openai-responses`、`google-generative-ai`）和 `src/providers/*`（目录 + 鉴权 + 目录数据）。
- **模型发现**：静态目录（`*.models.ts` + 生成的 `models.generated.ts`）+ 动态 `refreshModels()`（带 `ModelsStore` 持久化）。
- **流式调用**：`AssistantMessageEventStream`（事件协议 `start/text/thinking/toolcall/done|error`）；`Models.stream` / `complete` / `streamSimple` / `completeSimple` / `fetchDeferred` / `cancelDeferred`。
- **内容/消息类型**：`UserMessage` / `AssistantMessage` / `ToolResultMessage`、`TextContent` / `ThinkingContent` / `ImageContent` / `ToolCall`、`Context`、`Tool`、`Usage`。
- **鉴权/OAuth**：`CredentialStore`、API Key、`OAuthAuth`、`registerBunOAuthFlows()`（Bun 二进制内置 OAuth）。
- **token/成本**：`estimateContextTokens`、`calculateCost`、供应商 `usage`。
- 对 coding-agent 最重要的是 **`compat` 全局 API**（`stream` / `streamSimple` / `completeSimple` / `registerApiProvider` / `getApiProvider` / `setBedrockProviderModule`）。

**② coding-agent 具体依赖的符号**

`pi-ai` 主入口（值）：`contentText`、`uuidv7`、`modelsAreEqual`、`clampThinkingLevel`、`getSupportedThinkingLevels`、`cleanupSessionResources`、`isContextOverflow`、`isRecoverableLength`、`isRetryableAssistantError`、`resetApiProviders`、`retryAssistantCall`、`RetryPolicy`、`RetryCallbacks`。
类型：`Model`、`Api`、`KnownProvider`、`ImageContent`、`TextContent`、`AssistantMessage`、`Message`、`Usage`、`Context`、`Provider`、`ProviderHeaders`、`ProviderStreamOptions`、`ProviderRequestOptions`、`AuthResult`、`AuthEvent`、`AuthPrompt`、`AuthOperationOptions`、`Credential`、`CredentialInfo`、`CredentialStore`、`ApiKeyCredential`、`ModelsStore`、`ModelsRefreshOptions`、`ModelsRefreshResult`、`ModelsApiStreamOptions`、`ModelsSimpleStreamOptions`、`RefreshModelsContext`、`SimpleStreamOptions`、`StreamOptions`、`Transport`、`ThinkingLevel`、`OAuthLoginCallbacks`、`OAuthAuth`、`AuthCheck`、`AuthInfoLink`、`OAuthDeviceCodeInfo`、`ToolResultMessage`。

`pi-ai/compat`（值）：`stream`、`streamSimple`、`completeSimple`、`getApiProvider`、`setBedrockProviderModule`、`resetApiProviders`、`clampThinkingLevel`、`cleanupSessionResources`、`getSupportedThinkingLevels`、`isContextOverflow`、`isRecoverableLength`、`isRetryableAssistantError`、`modelsAreEqual`；类型：`AssistantMessage`、`ImageContent`、`Message`、`Model`、`Context`、`Usage`、`SimpleStreamOptions` 等。

子路径：`pi-ai/providers/all`（`builtinProviderCatalog.builtinModels()`）、`pi-ai/bedrock-provider`（`bedrockProviderModule`）、`pi-ai/bun-oauth`（`registerBunOAuthFlows`）、`pi-ai/oauth`（OAuth 类型）。

**③ 完成的功与使用情况**

| 功能 | 使用方式 |
|---|---|
| **实际 LLM 流式调用** | 所有生成都走 `compat` 全局 `streamSimple` / `stream` / `completeSimple`。`core/sdk.ts` 中 `Agent.streamFn` 调 `modelRuntime.streamSimple(model, context, {...})`；`ModelRuntime` 封装 `pi-ai` 的 `Models`。`setDefaultStreamFn(streamSimple)` 提供兜底。 |
| **模型注册/解析** | `ModelRuntime` 用 `pi-ai` 的 `Models` + `ModelsStore`；`model-resolver.ts` 用 `modelsAreEqual` / `clampThinkingLevel` / `getSupportedThinkingLevels`；`--models` 范围来自 `providers/all` 的 `builtinModels()`。 |
| **内容/消息类型** | `Message` / `AssistantMessage` / `UserMessage` / `ToolResultMessage` / `ImageContent` / `TextContent` / `Usage` / `Context` 贯穿 agent 循环与序列化。 |
| **鉴权/OAuth** | `CredentialStore` / `AuthResult` / `OAuthAuth` 驱动登录对话框与 CLI `/login`、`/check`；`registerBunOAuthFlows()` 在 Bun 二进制里注册内置 OAuth；`setBedrockProviderModule()` 在 `bun/register-bedrock.ts` 里替换 Bedrock 实现。coding-agent 也通过 `registerApiProvider` 注册自研 llama.cpp 供应商（`extensions/llama/provider.ts`）。 |
| **辅助函数** | `contentText`（抽取 assistant 文本）、`uuidv7`（ID）、`retryAssistantCall`/`RetryPolicy`（压缩/摘要重试）、`isContextOverflow`/`isRecoverableLength`/`isRetryableAssistantError`（溢出处理）、`cleanupSessionResources`（会话拆除）。 |

> 关键结论：coding-agent 在**主入口**只用 `pi-ai` 的“类型 + 辅助函数”，而把所有**实际生成**都路由到 **`compat` 全局流函数**，并通过 `providers/all`、`bedrock-provider`、`bun-oauth` 子路径拉取完整目录与 OAuth。任何对 `Model` / `AssistantMessage` / `Context` / `Usage` / 鉴权类型 / `compat` 流函数的改动都会直接影响 coding-agent。

---

### 3.3 `@earendil-works/pi-tui`（`tui/`）

**① 它是什么**
带**差异化渲染**的终端 UI 库。要点：

- **渲染器**：`TuiMainScreen`（主屏 + 回滚）、`TuiAltScreen`（备屏视口，应用自管滚动）；两者都通过 `TUI` 接口暴露 `start/stop/setFocus/addChild/requestRender`。
- **组件模型**：保留式组件树（`Container` + `Box`/`Spacer`/`VStack`/`HStack`/`ScrollView`），`render(width)` 返回每行字符串；两帧之间只重绘变化的行，并包裹在同步输出（`CSI 2026h…l`）中防闪烁。
- **组件库**：`Text`、`TruncatedText`、`Markdown`、`Input`、`Editor`、`Loader`、`CancellableLoader`、`SelectList`、`SettingsList`、`Image`。
- **输入/键盘**：`Key`/`KeyId`、`matchesKey`、`KeybindingsManager`、`setKeybindings`/`getKeybindings`，支持 Kitty 键盘协议。
- **文本测量**：`visibleWidth`、`truncateToWidth`（基于 `get-east-asian-width` + `Intl.Segmenter`）。
- **原生模块**：`native/win32/win32-console-mode.node`（启用 Windows VT 输入 + 修饰键检测）、`native/darwin/darwin-modifiers.node`。

**② coding-agent 具体依赖的符号**（71 处 import，~45 个文件，主要在 `modes/interactive/**`）

值/类：`ProcessTerminal`、`TuiMainScreen`、`TUI`、`setKeybindings`、`getKeybindings`、`KeyId`；组件 `Container`、`Box`、`Spacer`、`Text`、`TruncatedText`、`Markdown`、`MarkdownTheme`、`Loader`、`CancellableLoader`、`SelectList`、`SelectListLayoutOptions`、`SelectItem`、`SettingsList`、`Input`、`Editor`、`EditorOptions`、`EditorTheme`、`Image`、`Focusable`、`Component`；工具 `visibleWidth`、`truncateToWidth`、`fuzzyFilter`、`fuzzyMatch`、`getCapabilities`、`getImageDimensions`、`hyperlink`、`imageFallback`、`Marked`、`Token`；类型 `TuiMode`、`ScrollViewScrollbar`、`Keybindings`、`Keybinding`；以及整个包被注入扩展沙箱（`_bundledPiTui`）。

**③ 完成的功与使用情况**

| 功能 | 使用方式 |
|---|---|
| **交互界面宿主** | `cli/startup-ui.ts`、`cli/config-selector.ts`、`cli/session-picker.ts` 用 `ProcessTerminal` + `TuiMainScreen` 启动 TUI；`interactive-mode.ts` 驱动实时聊天。 |
| **消息记录（transcript）** | `assistant-message.ts` / `user-message.ts` / `branch-summary-message.ts` / `compaction-summary-message.ts` / `skill-invocation-message.ts` / `custom-message.ts` 用 `Markdown` + `Box` + `Text` + `Spacer` 渲染各类消息。 |
| **输入编辑器** | `custom-editor.ts` 用 `Editor`（`EditorTheme`/`EditorOptions`）；对话框用 `Input` + `Focusable`（`extension-input.ts`、`login-dialog.ts`）。 |
| **选择器/对话框** | `SelectList` + `SelectItem`/`SelectListLayoutOptions` 用于 model/theme/session/tree/show-images/thinking 选择；`SettingsList` 用于配置。 |
| **状态/媒体** | `Loader`/`CancellableLoader`（加载指示）、`Image` + `getCapabilities`/`getImageDimensions`/`hyperlink`（工具结果中的图片）。 |
| **键盘** | `setKeybindings`（CLI 初始化）、`getKeybindings` + `KeyId` 在各组件里匹配快捷键；`core/keybindings.ts` 用 `declare module` 扩充 `Keybindings` 注册自定义绑定。 |
| **扩展沙箱** | 整个 `pi-tui` 模块被注入扩展运行时，扩展可 `require("@earendil-works/pi-tui")`。 |

> 一句话：coding-agent 的**交互模式几乎完全建立在 `pi-tui` 之上**——一个 `TuiMainScreen`/`TuiAltScreen` 宿主，里面用 `VStack`/`ScrollView` 装 `Markdown`/`Box`/`Text` 消息组件，用 `Editor` 做输入，用 `SelectList` 做选择，用 `Loader`/`Image` 做状态与媒体，全部经差异化渲染引擎输出。

---

### 3.4 `@earendil-works/pi-protocol`（`protocol/`）

**① 它是什么**
传输无关的 **CBOR 协议 + 字节流分帧**，用于远程 pi 会话。协议版本 `PROTOCOL_VERSION = 1`：

- 线格式：`[uint32-be 长度][一个定长 CBOR item]`。
- 用 TypeBox 定义全部消息 schema（`schemas.ts`）：`ClientHello`、`RequestEnvelope` / `ResponseEnvelope`、`ServerEvent`（`server_snapshot` / `session_snapshot` / `session_progress` / `session_removed`）、`SessionSnapshot` / `ServerSnapshot` / `TranscriptItem`（user/assistant/tool）、`Command`（`list`/`create`/`attach`/`detach`/`prompt`/`steer`/`abort`/`set_model`/`set_thinking`）等。
- `codec.ts`（CBOR 严格子集编解码）、`framing.ts`（`encodeFrame` / `FrameDecoder`，与 schema/CBOR 解耦）、`cbor/`（底层编解码 + 选项/限制）。
- 仅依赖 `typebox`，**不依赖任何兄弟包**。本包由 `pi-server`（服务端）与 `pi-client`（客户端）共同使用。

**② coding-agent 具体依赖的符号**
仅 2 处，都在 `src/client/`：
```ts
// src/client/remote-session.ts
import { /* encodeClientMessage, createServerMessageDecoder, 类型… */ } from "@earendil-works/pi-protocol";
// src/client/transcript.ts
import type { JsonValue, SessionSnapshot, TranscriptItem, TranscriptProgress } from "@earendil-works/pi-protocol";
```

**③ 完成的功与使用情况**
coding-agent 的 `./client` 子模块（`src/client/remote-session.ts`、`transcript.ts`）实现 `RemoteSession`——连接一个**独立的 pi server 进程**的客户端。它用 `pi-protocol` 的 `encodeClientMessage` / `createServerMessageDecoder` 做消息的**编解码与分帧**，用 `SessionSnapshot` / `TranscriptItem` / `TranscriptProgress` 等类型描述远程快照与增量进度。也就是说，**`pi-protocol` 仅服务于 coding-agent 的“远程会话客户端”特性**，不参与本地 interactive/print/rpc 模式。

---

### 3.5 `@earendil-works/pi-client`（`client/`）

**① 它是什么**
传输无关的**远程会话客户端**，通过一个小 `ByteTransport` 接口交换“长度前缀 CBOR”消息。关键点：

- `PiClient`：连接、订阅权威快照（`subscribe`）、观察协议事件（`onEvent`）、`createSession` / `attachSession` / `acquireSession`（exclusive/shared `SessionLease`）/ `detach` / `dispose`。
- 请求按 ID 关联；快照/成功响应是权威的，progress 事件不乐观修改状态。
- 子路径 `pi-client/unix` 提供 `createUnixTransportFactory`（Unix 域套接字传输，Node/Bun）。
- 仅依赖 `pi-protocol`，无 Node 特定 import（根入口传输/运行时中立）。

**② coding-agent 具体依赖的符号**
仅 1 处：`src/client/remote-session.ts` 从 `@earendil-works/pi-client` 引入 `PiClient` 等。

**③ 完成的功与使用情况**
coding-agent 的 `RemoteSession`（`src/client/remote-session.ts`）把 `PiClient` 包成更高层的远程会话 API（`RemoteSession`、`RemoteSessionState`、`RemoteSessionLifecycle`、各类 operation）。它配合 `pi-protocol` 的消息类型，让 coding-agent 可以作为**客户端**连到一个远程 pi server（远程执行、集中式会话）。这是 coding-agent 对外暴露的 `./client` 导出所支撑的能力。

---

### 3.6 `@earendil-works/pi-telemetry`（`telemetry/`，传递依赖）

**① 它是什么**
供应商中立的可观测性契约：

- `TelemetryContext` / `TelemetrySpan` 契约（回调式 `startSpan`）。
- `NOOP_TELEMETRY_CONTEXT`（禁用时）、`InMemoryTelemetryContext`（进程内参考实现）。
- 类型化 schema 工具：`defineTelemetrySchema` / `createTypedSpanStarter`（编译期校验 span 名与属性）。
- 适配器一致性测试（`testing` 子路径）。
- 不绑定任何后端（无 exporter、无全局 current-span、无 `AsyncLocalStorage`）。

**② coding-agent 具体依赖的符号**
coding-agent **没有直接 import** 它，但通过 `pi-agent-core` 与 `pi-ai` **间接使用**：

- `pi-agent-core` 导出 `AGENT_TELEMETRY_SCHEMAS`、`AI_TELEMETRY_SCHEMA`、`HARNESS_TELEMETRY_SCHEMA`、`startAiSpan`、`startHarnessSpan`；
- `pi-ai` 在请求选项中接受 `telemetryContext`，把 AI 请求/事件 span 接入调用方提供的上下文。

**③ 完成的功与使用情况**
telemetry 是 agent-core 与 ai 的**可观测性骨架**。coding-agent 可以不提供任何遥测（用 `NOOP`），也可以把 `TelemetryContext` 一路透传，把 agent 循环、AI 请求、工具调用等 span 接到 OpenTelemetry / Sentry / 日志后端。coding-agent 自身的 `core/telemetry.ts` 即围绕这个契约做本地接入。

---

## 4. 复刻（开源重建）建议

如果你想仅根据这些文档把 `coding-agent` 从头复刻出来，建议按**依赖顺序**逐包实现，再拼装主包：

### 4.1 构建顺序

1. **`telemetry`**（无兄弟依赖，纯契约）→ 先实现，供其余包引用。
2. **`ai`**（依赖 telemetry）：实现 `Models`/`Provider` 抽象 + 至少 1–2 个供应商（如 openai、anthropic）+ 内容/消息类型 + `compat` 全局 `streamSimple`/`stream`/`completeSimple` + 鉴权 `CredentialStore`。
3. **`agent-core`**（依赖 ai、telemetry）：实现 `Agent` + agent loop（`streamFn` 透传）、`Session`/`SessionStorage`/JSONL、`createBashTool` 等内置工具、`compact`/`generateBranchSummary`、`Skills`/`PromptTemplates`、`setDefaultStreamFn`、类型与 `AgentHarness` 契约。
4. **`tui`**（无兄弟依赖）：实现差异化渲染 `TuiMainScreen`/`TuiAltScreen`、`Component` 模型、核心组件（`Text`/`Markdown`/`Box`/`Editor`/`SelectList`/`Loader`/`Image`）、键盘与文本测量。
5. **`protocol`**（仅 typebox）：实现 CBOR 编解码 + 分帧 + TypeBox schema。
6. **`client`**（依赖 protocol）：实现 `PiClient` + `ByteTransport` + unix 子路径。
7. **`coding-agent`**（依赖以上全部）：按 §2 的模块组装——`cli.ts`→`main.ts`→`createAgentSession`→`AgentSession`→三种模式；实现 `core/tools`、`core/extensions`、`core/session-manager`、`core/compaction`、`core/model-runtime`、`core/settings-manager`、`core/resource-loader`、`modes/interactive`（基于 tui）、`modes/print`、`modes/rpc`、`server/create-harness`、`client/RemoteSession`。

> `server`、`session-backends/sqlite-node`、`evals` 不在 coding-agent 的依赖链上，可延后或省略（coding-agent 用自研 JSONL `SessionManager`）。

### 4.2 必读/必复刻的关键文件（coding-agent）

- 入口与编排：`src/cli.ts`、`src/main.ts`、`src/core/sdk.ts`、`src/core/agent-session-runtime.ts`、`src/core/agent-session-services.ts`。
- 核心封装：`src/core/agent-session.ts`（整包灵魂）。
- 工具：`src/core/tools/*`（尤其 `read/bash/edit/write` 及 `edit-diff`、`file-mutation-queue`、`truncate`）。
- 扩展：`src/core/extensions/*`（`loader.ts`、`runner.ts`、`index.ts`、`types.ts`、`wrapper.ts`）。
- 持久化：`src/core/session-manager.ts`。
- 压缩：`src/core/compaction/*`（编排）+ 重导出 agent-core 引擎。
- 模型/鉴权：`src/core/model-runtime.ts`、`src/core/model-resolver.ts`、`src/core/auth-storage.ts`。
- 模式：`src/modes/interactive/interactive-mode.ts`、`src/modes/print-mode.ts`、`src/modes/rpc/rpc-mode.ts`、`src/modes/rpc/rpc-types.ts`。
- 服务端：`src/server/create-harness.ts`。
- 远程客户端：`src/client/remote-session.ts`、`src/client/transcript.ts`。

### 4.3 两个容易踩的坑

1. **流函数走 `compat` 而非主入口**：coding-agent 的所有 LLM 调用都经 `pi-ai/compat` 的 `streamSimple`/`stream`/`completeSimple`，并 `setDefaultStreamFn(streamSimple)` 兜底。复刻时不要只实现 `pi-ai` 主入口的 `Models.stream`，否则扩展代码会找不到默认流函数。
2. **运行路径用 `Agent` + 自研 `SessionManager`，不是 `AgentHarness`**：`AgentHarness` 当前版本大量方法是桩（`HarnessNotImplemented`）。复刻时优先实现 `Agent` 循环 + 你自己的 JSONL 会话存储 + 压缩编排，这与 coding-agent 的真实运行路径一致。

---

## 5. 附：核心类型速查（便于复刻时对齐接口）

| 概念 | 定义来源 | 说明 |
|---|---|---|
| `AgentMessage` | pi-agent-core | 统一消息（user/assistant/toolResult/custom…），agent 循环的货币 |
| `Model` / `Context` / `Usage` | pi-ai | 模型引用、对话上下文、token/成本 |
| `AssistantMessage` / `ImageContent` / `TextContent` | pi-ai | 内容块类型，贯穿序列化与渲染 |
| `StreamFn` | pi-agent-core | `(model, context, options?) => AssistantMessageEventStream`，agent 与 LLM 的边界 |
| `Transport` | pi-ai（被 agent-core 透传） | 线协议选择器（`auto`/HTTP/WebSocket） |
| `Tool` / `AgentTool` | pi-ai / pi-agent-core | 工具定义与运行期实例 |
| `SessionSnapshot` / `TranscriptItem` | pi-protocol | 远程会话的权威快照与增量 |
| `TelemetryContext` / `TelemetrySpan` | pi-telemetry | 可观测性契约（可选接入） |
| `Component` / `TUI` | pi-tui | 终端 UI 组件与渲染器接口 |

---

*文档生成方式：逐包阅读 `packages/` 下 `coding-agent`、`agent`、`ai`、`tui`、`protocol`、`client`、`telemetry` 的真实源码、README 与 `package.json` 后整理，覆盖架构、功能、模块与对同包代码的依赖关系及使用位置。*
