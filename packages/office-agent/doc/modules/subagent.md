# office-agent · 多智能体（subagent）

> 参考 coding-agent 官方 subagent 扩展示例（`packages/coding-agent/examples/extensions/subagent/`），
> 在 office-agent 内实现**进程级多智能体**：主 agent 通过 `subagent` 工具把任务委派给
> 独立子进程（隔离上下文窗口），支持单发 / 并行 / 链式三种模式，按角色（scout/planner/
> worker/reviewer 等）拆分工作流。复用 office 扩展系统（doc/modules/extensions.md），
> 不改 pi-* 引擎。

---

## 1. 背景：coding-agent 的 subagent 用法（原文机制）

### 1.1 子进程调用

subagent 扩展对每个子任务 **spawn 一个独立 `pi` 进程**：

```
pi --mode json -p --no-session [--model <provider/id>] [--thinking <level>] [--tools a,b] <prompt>
```

- `--mode json`：输出格式为 **JSON lines**（每行一个事件：`tool_call` / `tool_result_end` /
  `assistant_message` 等），逐行解析为结构化结果
- `-p`：print 模式（一次性跑完退出）
- `--no-session`：不落会话
- `--model` / `--thinking` / `--tools`：覆盖子 agent 的模型/推理/工具集

结果结构（SingleResult）：`{ agent, task, exitCode, messages, stderr, usage, model, step }`。

### 1.2 三种模式（subagent 工具入参）

| 模式 | 入参 | 行为 |
|---|---|---|
| single | `{ agent, task }` | 一个子 agent 跑一个任务 |
| parallel | `{ tasks: [{agent, task}, ...] }` | 并行执行（上限 8 任务、4 并发），各自独立进程 |
| chain | `{ chain: [{agent, task}, ...] }` | 顺序执行，`{previous}` 占位符把上一步输出传给下一步 |

同时只能指定一种模式，否则报错并列出可用 agents。

### 1.3 角色定义（agents/*.md）

每个角色是一个 markdown 文件：**frontmatter（name/description/tools/model）+ 正文（system prompt）**。

```markdown
---
name: scout
description: 快速调研，返回压缩上下文供交接
tools: read, grep, find, ls, bash
model: claude-haiku-4-5
---

You are a scout. ...（系统提示正文）
```

内置角色（coding-agent）：`scout`（调研）/ `planner`（规划）/ `reviewer`（审校）/ `worker`（通用执行）。

### 1.4 工作流预设（prompts/*.md）

工作流是**提示模板**（不是代码）：指导主 agent 用 chain 模式组合角色。

```markdown
---
description: 完整实现工作流 - scout 调研、planner 规划、worker 实现
---
Use the subagent tool with the chain parameter to execute this workflow:
1. use "scout" to find all code relevant to: $@
2. use "planner" to create a plan using {previous}
3. use "worker" to implement the plan using {previous}
```

### 1.5 agent 发现与作用域

- 从 `~/.pi/agent/agents/*.md`（user 作用域）与 `<cwd>/.pi/agents/*.md`（project 作用域）发现
- `agentScope: "user" | "project" | "both"`；project 级 agent 需 UI 确认（不可信仓库防护）
- 用到的真实 API：`getAgentDir()`、`parseFrontmatter()`（coding-agent 导出）

---

## 2. office-agent 实现方案

### 2.1 总览（增量叠加，不动现有三模式）

```
src/
├── modes/json.ts                 # 新增：--mode json（一次性 + JSON lines 输出，子进程入口）
├── main.ts                       # mode 解析加 "json"
├── extensions/                   # 已有扩展系统
│   └── office-subagent.ts        # 新增：subagent 工具（spawn office 子进程）
├── agents/                       # 新增：内置办公角色（scout/planner/worker/reviewer）
└── doc/modules/subagent.md       # 本文档
```

关键适配点（与 coding-agent 的差异）：

| 项 | coding-agent | office-agent |
|---|---|---|
| 子进程命令 | `pi --mode json -p --no-session` | `office --mode json --prompt "<task>"`（新 json 模式） |
| 角色目录 | `~/.pi/agent/agents` + `.pi/agents` | `~/.office-agent/agents` + `<cwd>/.office-agent/agents`（沿用 office agentDir） |
| 系统提示注入 | 角色 system prompt 全文 | 角色 frontmatter.systemPrompt（无则用 OFFICE_SYSTEM_PROMPT 前缀拼接） |
| 工具集 | `--tools` 按 coding 工具名过滤 | 按 officeTools 名过滤（wps_writer/poster_compose/html_generate...） |

### 2.2 `office --mode json`（子进程调用入口）

- **语义**：一次性跑 `--prompt`，stdout 输出 **JSON lines**（与 coding-agent `--mode json` 对齐），
  每行一个事件：`assistant_message` / `tool_call` / `tool_result_end`，末尾 `usage` 汇总
- **复用**：`modes/print.ts` 的执行逻辑（session.prompt + 取消息），只把输出换成 JSON lines；
  支持 `--model` / `--thinking` / `--tools`（后续加模型解析后生效，当前演示流照常）
- **无需 --no-session**：office print 本就不落会话

### 2.3 subagent 工具（扩展系统内实现）

镜像 coding-agent 示例，注册进 office 扩展：

```typescript
// src/extensions/office-subagent.ts
import type { OfficeExtensionFactory } from "./types.ts";

export const officeSubagent: OfficeExtensionFactory = (pi) => {
  pi.registerTool({
    name: "subagent",
    label: "多智能体委派",
    description: [
      "把任务委派给独立子进程（隔离上下文）的专用 agent。",
      "模式：single（agent+task）/ parallel（tasks 数组）/ chain（顺序 + {previous} 占位）。",
      "内置角色：scout/planner/worker/reviewer（见 ~/.office-agent/agents）。",
    ].join(" "),
    parameters: SubagentParams, // 与 coding-agent 同构：agent/task/tasks/chain/agentScope
    async execute(_id, params) {
      // 1) discoverAgents(cwd, scope) 读 agents/*.md
      // 2) 校验恰好一种模式
      // 3) spawn("office", ["--mode","json","--prompt", buildPrompt(task, role)])
      // 4) 逐行解析 stdout JSON → {messages, usage}
      // 5) chain 模式用 {previous} 注入上一步输出
      // 返回 { content, details: { artifacts, results } }
    },
  });
};
```

- **spawn 细节**：`spawn(officeBin, ["--mode","json","--prompt",task])`，`officeBin` 优先
  环境变量 `OFFICE_BIN`，否则 `process.execPath` + 包内 `dist/cli.js`（或 PATH 中 `office`）
- **并发限制**：parallel 最多 8 任务、4 并发（与 coding-agent 一致）；超时/abort 传播
- **结果**：聚合 `results: [{agent, task, exitCode, messages, stderr, usage}]` 进 details

### 2.4 内置办公角色（agents/*.md）

| 角色 | 定位 | 办公版 tools |
|---|---|---|
| scout | 快速调研（文件/目录/上下文），返回压缩结论 | read/glob/grep（若注入） |
| planner | 拆解任务为可执行步骤（文档结构/海报分层/HTML 区块） | 无工具，纯规划 |
| worker | 通用执行：调 officeTools 生成 docx/xlsx/pptx/海报/HTML | 全部 officeTools |
| reviewer | 审校产物（结构完整性/中文质量/预览校验） | html_preview 等只读类 |

frontmatter 复用 coding-agent 的字段（name/description/tools/model），无 UI 确认环节
（office 无 project agents 的交互确认需求，默认 user 作用域，后续需要再补）。

### 2.5 办公工作流预设（prompts/*.md）

```
implement-document.md    # scout 调研素材 → planner 规划结构 → worker 生成 docx
poster-campaign.md       # scout 收集文案要点 → planner 拆文字层/背景 → worker(poster_*) 出图+合成
html-landing.md          # scout 调研竞品 → planner 规划区块 → worker(html_generate) → reviewer(html_preview) 校验
```

每个都是提示模板：`$@` 为任务输入，`{previous}` 链式传上下文——与 coding-agent 一致。

---

## 3. 接入方式

```typescript
// 编程式：SDK 注入 subagent 扩展
import { createOfficeAgentSession, officeSubagent } from "@earendil-works/pi-office-agent";
const { session } = await createOfficeAgentSession({
  extensions: [officeSubagent],
  streamFn: makeOfficeDemoStreamFn(), // 演示流；主 agent 决定何时委派
});
await session.prompt("用 scout → planner → worker 帮我做一份季度总结 docx");

// 或扩展目录加载（doc/modules/extensions.md §4）
import { loadOfficeExtensionsFromDir } from "@earendil-works/pi-office-agent";
const exts = await loadOfficeExtensionsFromDir("~/.office-agent/extensions");
```

CLI 侧：`office --mode interactive`（或 rpc）配 `--extensions` 目录后即可在对话中使用 subagent。

---

## 4. 验收点（AC）

- [ ] AC-SUB-1 `office --mode json --prompt "写季度总结"` 输出合法 JSON lines（含 assistant/tool_call 事件 + usage）
- [ ] AC-SUB-2 subagent 工具 single 模式：spawn 子进程跑通一个 agent 任务并回传 messages
- [ ] AC-SUB-3 parallel 模式：≥2 任务并行完成，全部结果聚合
- [ ] AC-SUB-4 chain 模式：`{previous}` 占位替换生效（scout → planner 两段）
- [ ] AC-SUB-5 角色发现：`~/.office-agent/agents/*.md` 与内置角色都能被 subagent 解析
- [ ] AC-SUB-6 回归：现有三模式（interactive/print/rpc）与既有验收全部通过（增量叠加）
