# Phase 4 · office-agent 自有入口（cli / main / 三模式，镜像 §2.2–2.3）

> **阶段目标**：给新建的 `office-agent` 包装上**自己的入口**——`cli.ts` / `main.ts` 与三种运行模式（interactive / print / rpc），**结构镜像 coding-agent 的 §2.2 / §2.3**（架构文档里已写清楚它怎么解析参数、怎么起 `AgentSession`、rpc 模式怎么用 `pi-protocol` 收发）。bin 名是 `office`（在 phase-0 的 `package.json` 已声明）。
>
> 这一步的本质是 **"照着 coding-agent 建一个新 agent 的入口"**，而不是去改 coding-agent 的 `cli.ts`——coding-agent 整个生命周期里一行都不用动，它只是我们的参考范本。

---

## 1. 功能需求（FR）

| 编号 | 需求 | 对应架构文档 | 说明 |
|---|---|---|---|
| FR-4.1 | `office` 命令解析 `--mode interactive/print/rpc` | §2.2 启动流程 | 镜像 coding-agent 的参数解析 |
| FR-4.2 | interactive 模式：默认 TUI（`pi-tui`），可选改 Web 工作台 | §2.3 / §2.14 | TUI 用 `pi-tui`（引擎复用）；Web 用 `office-gui`（phase-3） |
| FR-4.3 | print 模式：一次性跑完打印结果退出 | §2.3 | 镜像，批量 / CI 场景 |
| FR-4.4 | rpc 模式：用 `pi-protocol` 起 RPC server，供 `office-gui` 连 | §2.3 / §2.14 | 镜像 coding-agent 的 `modes/rpc`，协议同 `pi-protocol` |
| FR-4.5 | 默认加载办公工具集 + 办公系统提示 | §2.5 / §2.12 | 由 `createAgentSession`（phase-2）保证，入口不硬编码 |

## 2. 入口结构（镜像 coding-agent §2.1–2.3）

```typescript
// office-agent/src/cli.ts —— 镜像 coding-agent/src/cli.ts
//   解析参数 → 选模式 → 调 main(mode, args)
//   （参数名、默认值尽量与 coding-agent 对齐，降低认知成本）

// office-agent/src/main.ts —— 镜像 coding-agent/src/main.ts
//   interactive: 用 pi-tui 起终端 UI（复用引擎），或 spawn office-gui
//   print:      一次性跑完打印结果
//   rpc:        用 pi-protocol codec 起 RPC server（镜像 coding-agent modes/rpc）
//               供 office-gui 经 RemoteSession 连（phase-3）

// office-agent/src/modes/index.ts —— 镜像 coding-agent/src/modes/index.ts
//   导出三种模式处理函数
```

> 关键：**rpc 模式的 server 端实现镜像 coding-agent 的 `modes/rpc/rpc-mode.ts`**——它怎么用 `pi-protocol` 编解码、怎么把 `AgentSession` 的事件推成 `ServerEvent`，你就怎么写。这样 `office-gui` 才能直接复用 `coding-agent/client` 的 `RemoteSession` 客户端（协议同一套，`phase-0 §3` 已验证）。

## 3. 默认领域装配（不硬编码在入口）

入口只负责"选模式 + 起会话"，**不**在 `cli.ts` 里硬编码办公工具/提示——那部分由 `office-agent` 自己的 `createAgentSession`（`core/sdk.ts`，phase-2 已镜像）默认注入：

```typescript
// office-agent/src/main.ts 节选
import { createAgentSession } from "./core/sdk";   // 默认已注入 officeTools + 办公提示
import { runInteractive, runPrint, runRpc } from "./modes";

export async function main(mode: Mode, args: Args) {
  const session = createAgentSession({ cwd: args.cwd, model: args.model });
  switch (mode) {
    case "interactive": return runInteractive(session, args); // TUI 或 spawn office-gui
    case "print":       return runPrint(session, args);
    case "rpc":         return runRpc(session, args);          // pi-protocol server
  }
}
```

## 4. 验收标准（AC）

- [ ] AC-4.1 `office --mode print --prompt "写季度总结"` 能端到端产出 `.docx` 并退出（验证入口 + SDK + 工具闭环）。
- [ ] AC-4.2 `office --mode interactive` 进入 TUI（用 `pi-tui`，引擎复用），可对话并调用办公工具。
- [ ] AC-4.3 `office --mode rpc` 起 RPC server；`office-gui`（phase-3）经 `RemoteSession` 连上，对话生成 docx 可预览。
- [ ] AC-4.4 入口**不硬编码**办公工具/提示——它们来自 `createAgentSession` 的默认装配（phase-2）。

## 5. 里程碑与退出条件

- **退出条件**：`office` 命令三种模式全部可用，办公智能体 MVP 成型（对话 → 生成 docx / html → 可选预览）。
- 此阶段标志着"参照 coding-agent 新建的兄弟 agent"骨架完成。后续 phase-5 / 6 是在此之上**增加工具与提示**，不改变入口形态，更不改引擎。
- **坑提醒**：跑 TS 用 `node --experimental-strip-types`，import 需带 `.ts` 扩展名（Node 22.7+）；若打包用 `tsc`，确保 `module: node16 / nodenext`。
