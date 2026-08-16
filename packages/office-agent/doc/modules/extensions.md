# office-agent · 扩展系统（extensions/）

> 镜像 coding-agent 的 extensions 机制（架构文档 §2.7）——让用户**不改 core 代码**即可给
> office-agent 追加自定义办公工具、提示片段、命令与快捷键。本模块只定义注册契约与执行器，
> agent loop / 会话 / 引擎（pi-agent-core）零改动。

## 1. 目标

- **面向用户**：写一个 TS 文件，导出一个工厂函数，就能注册自己的工具/提示，无需改 `officeTools`。
- **与 coding-agent 对等**：`ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>`（真实类型，
  见 coding-agent `src/core/extensions/types.ts:1519`）。
- **轻量化**：office 只保留对办公场景有用的注册能力（工具 / 提示片段 / 命令），不做 TUI 渲染字段。

## 2. API 形态（基于真实导出，不发明新类型）

```typescript
// src/extensions/types.ts
export interface OfficeExtensionAPI {
  /** 注册一个办公工具（复用 phase-2 的 OfficeToolDefinition 双形态） */
  registerTool<TParams extends TSchema>(tool: OfficeToolDefinition<TParams>): void;
  /** 注册一段系统提示片段（phase-6 OFFICE_SYSTEM_PROMPT 拼接用） */
  registerPromptSnippet(name: string, snippet: string): void;
  /** 注册一个自定义命令（cli `office run <cmd>` 或扩展内部调度） */
  registerCommand(name: string, handler: (args: string[]) => Promise<string>): void;
}

export type OfficeExtensionFactory = (pi: OfficeExtensionAPI) => void | Promise<void>;

export type OfficeInlineExtension =
  | OfficeExtensionFactory
  | { name: string; factory: OfficeExtensionFactory };
```

> 注：coding-agent 的 `InlineExtension` 支持 `{ name, factory, hidden? }` 形态；office 保留
> `name` 用于启动清单展示，`hidden` 暂不需要。

## 3. 用法示例（用户视角）

```typescript
// my-office-extension.ts
import type { OfficeExtensionFactory } from "@earendil-works/pi-office-agent";
import { Type } from "typebox";

export const myExtension: OfficeExtensionFactory = (pi) => {
  pi.registerTool({
    name: "office_fax",
    label: "传真发送",
    description: "把 docx 发送到指定传真号码（示例扩展）",
    parameters: Type.Object({ path: Type.String(), number: Type.String() }),
    meta: { direction: "wps" },
    async execute(_id, params) {
      return { content: [{ type: "text", text: `已发送 ${params.path} → ${params.number}` }], details: { artifacts: [] } };
    },
  });
  pi.registerPromptSnippet("传真能力", "- office_fax：可把 docx 发送传真（需企业传真服务）");
};
```

接入：`createOfficeAgentSession({ extensions: [myExtension] })`，或目录加载
`loadOfficeExtensionsFromDir("./extensions")`。

## 4. 执行器与接入点

- `src/extensions/runner.ts` — `runOfficeExtensions(factories, ctx)`：顺序执行工厂，
  收集注册的工具/提示/命令，返回 `ExtensionRegistration`。
- 接入点：`core/sdk.ts` 的 `createOfficeAgentSession` 增加 `extensions?: OfficeInlineExtension[]`，
  构造 Agent 前先跑扩展，把新工具合并进 `initialState.tools`（`[...officeTools, ...extTools]`），
  提示片段追加到 `OFFICE_SYSTEM_PROMPT`。
- 目录加载：`loadOfficeExtensionsFromDir(dir)` 用动态 `import()` 加载 `*.js/.mjs` 文件，
  导出为 `OfficeExtensionFactory` 或数组；失败项收集到 `errors` 不阻塞启动。

## 5. 与既有模块的关系

| 模块 | 关系 |
|---|---|
| `core/tools` | 扩展注册的工具与 `officeTools` 合并进 Agent；优先级：扩展在后（同名冲突时报错） |
| `core/prompt.ts` | `registerPromptSnippet` 的内容追加到系统提示尾部 |
| `pi-agent-core` | 不修改；工具仍是 `AgentTool`（经 `wrapOfficeToolDefinition`） |

## 6. 验收

- 扩展工厂注册的工具能进入 `Agent` 工具集并可被调用（fake streamFn 驱动）。
- `registerPromptSnippet` 的内容出现在最终系统提示中。
- 目录加载能读取一个扩展文件并执行；坏文件只报错不阻塞。
