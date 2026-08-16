# office-agent · 独立启动器（server/）

> 把 rpc 模式从 `modes/rpc.ts` 抽成可复用的 `startOfficeServer()`——一行代码起一个
> pi-protocol server（复用 `createOfficeAgentSession` 的默认装配 + 真实 listener），
> `office --mode rpc` 与编程式启动共用同一条链路。

## 1. 目标

- **一行启动**：`const { server, address } = await startOfficeServer({ port: 4317 })`。
- **装配统一**：agent 来自 `createOfficeAgentSession`（officeTools + 办公提示 + 可注入扩展），
  不重复拼装。
- **transport 可选**：默认 TCP（Windows 可用）；`unix` 在非 Windows 平台可选。
- **与 GUI 演示解耦**：`gui/demo-server.ts` 的内存链路保留给 AC-3 演示，正式入口走 server/。

## 2. API 形态

```typescript
// src/server/index.ts
import { PiServer } from "@earendil-works/pi-server";

export interface OfficeServerOptions {
  host?: string;                 // TCP 监听地址（默认 127.0.0.1）
  port: number;                  // TCP 监听端口
  transport?: "tcp" | "unix";    // 默认 tcp；unix 仅非 Windows
  unixPath?: string;             // transport="unix" 时的 socket 路径
  cwd?: string;                  // 会话工作目录
  model?: Model<any>;            // 可选真实模型（缺省演示流）
  extensions?: OfficeInlineExtension[]; // 扩展系统（doc/modules/extensions.md）
  onReady?: (address: string) => void;
}

/** 启动 office pi-protocol server，返回可关闭的句柄。 */
export async function startOfficeServer(
  options: OfficeServerOptions,
): Promise<{ server: PiServer; service: OfficeServerService; address: string; close(): Promise<void> }>;
```

> 依赖真实导出：`PiServer`（`@earendil-works/pi-server`）、`PiServerListener`、
> `OfficeDemoServerService`（复用 `gui/demo-server.ts`，支持注入外部 agent）、
> `createTcpListener` / `createUnixListener`（pi-server transports/unix）。

## 3. 用法示例

```typescript
import { startOfficeServer } from "@earendil-works/pi-office-agent";

const { address, close } = await startOfficeServer({ port: 4317 });
console.log(`office rpc server: ${address}`); // → office rpc server: 127.0.0.1:4317
// ... office-gui 用 client/openOfficeSession 连上
await close(); // SIGINT 时优雅关闭
```

## 4. 与既有模块的关系

| 模块 | 关系 |
|---|---|
| `modes/rpc.ts` | 重构为调用 `startOfficeServer`（行为不变，AC-4.3 回归） |
| `gui/demo-server.ts` | `OfficeDemoServerService` 复用；内存 listener 保留给演示 |
| `core/sdk.ts` | `createOfficeAgentSession` 是 agent 来源（含 extensions 注入） |
| `modes/tcp.ts` | `createTcpListener` 由 server/ 统一出口（modes 保留 re-export） |

## 5. 验收

- `startOfficeServer({ port })` 起 server，`openOfficeSession`（client/）连上并完成对话。
- `modes/rpc.ts` 重构后 `office --mode rpc` 行为不变（AC-4.3 回归通过）。
- 关闭句柄能优雅停掉 listener。
