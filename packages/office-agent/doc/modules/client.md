# office-agent · 客户端封装（client/）

> 让外部消费者**不直接 import `@earendil-works/pi-coding-agent/client`** 就能用
> office 会话客户端：封装 `PiClient` 连接 + `RemoteSession` 桥 + transport 工厂，
> 对外暴露 office 自己的简洁入口。协议仍是 pi-protocol，底层复用真实包，不重造。

## 1. 目标

- **对外 SDK 形态**：`import { openOfficeSession } from "@earendil-works/pi-office-agent/client"`。
- **内部收敛**：phase-3/4 里散落的连接逻辑（TCP transport、PiClient、RemoteSession 装配）
  统一进 `src/client/`，GUI 与外部消费者共用。
- **不重造协议**：连接仍走 `PiClient`（pi-client）+ `RemoteSession`（coding-agent/client），
  只是包一层 office 语义的入口。

## 2. API 形态（基于真实导出）

```typescript
// src/client/index.ts
import { PiClient } from "@earendil-works/pi-client";
import { RemoteSession } from "@earendil-works/pi-coding-agent/client";

export interface OfficeClientOptions {
  host?: string;            // rpc server 地址（默认 127.0.0.1）
  port: number;             // rpc server 端口
  cwd?: string;             // 会话工作目录（RemoteSession.create 用）
  transport?: "tcp";        // 预留 unix（Windows 不支持）
}

/** 创建连到 office rpc server 的 PiClient（TCP transport）。 */
export function createOfficePiClient(options: Pick<OfficeClientOptions, "host" | "port">): PiClient;

/** 连接并创建 RemoteSession（office-gui / 外部消费者入口）。 */
export async function openOfficeSession(options: OfficeClientOptions): Promise<RemoteSession>;
```

> 依赖真实导出：`PiClient`（`@earendil-works/pi-client` 主入口）、`RemoteSession`（
> `@earendil-works/pi-coding-agent/client` 子路径）、`createTcpTransportFactory`
>（office `src/modes/tcp.ts`，Windows 可用 TCP 字节传输）。

## 3. 用法示例（外部消费者视角）

```typescript
import { openOfficeSession } from "@earendil-works/pi-office-agent/client";

// 连上 `office --mode rpc --port 4317` 起的 server，建会话并对话
const session = await openOfficeSession({ port: 4317, cwd: "/tmp/out" });
session.subscribe((state) => console.log(state.transcript));
await session.submit("写季度总结 docx");
const artifacts = extractArtifacts(session.state.transcript);
```

## 4. 与既有模块的关系

| 模块 | 关系 |
|---|---|
| `modes/tcp.ts` | `createTcpTransportFactory` 移入 client 统一出口（modes 保留 re-export 兼容） |
| `gui/backend.ts` | `WorkbenchSession` 内部改用 `openOfficeSession`，消除重复装配 |
| `@earendil-works/pi-coding-agent/client` | 仅 re-export `RemoteSession` 类型，不修改 |

## 5. 包导出配置

`package.json` 增加子路径导出，使 `@earendil-works/pi-office-agent/client` 可解析：

```json
"exports": {
  ".": "./dist/index.js",
  "./client": "./dist/client/index.js"
}
```

（与 coding-agent 的 `./client` 子路径形态一致。）

## 6. 验收

- `openOfficeSession({ port })` 能连上 `office --mode rpc` server 并完成一次 submit。
- 不依赖 import `pi-coding-agent/client` 的直接路径（从 office client 子路径导出）。
- 外部消费者示例可编译（tsc/tsgo 类型通过）。
