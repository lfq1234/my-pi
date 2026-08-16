# Phase 3 · GUI 工作台 `office-gui` 包

> **阶段目标**：新增 `office-gui` 包，提供**办公 Web 工作台**（对标 bolt.new 界面）：左侧聊天流、右侧实时预览面板、底部/侧栏产物列表。它通过 `coding-agent/client` 的 **`RemoteSession`**（底层基于 `pi-protocol`/`pi-client`）连接后端 agent 进程，**不自己跑 LLM、不重定义任何协议**。本阶段让"对话 → 生成 docx/html → 预览"闭环可见。
>
> ⚠️ 复用原则：GUI 只做**渲染与交互**，所有会话/对话流/协议逻辑一律复用 phase-0 定好的 `RemoteSession` + `pi-protocol` 类型。之前的草稿自创了 `WorkbenchSession.send`/`onTranscript` 和 `new PiClient()+createSession({mode:"office"})`，已废除，下面改用真实 API。
>
> **定位澄清（呼应"核心内容不换"）**：`office-gui` 是**可选**的——它只是把 `office-agent` 的 `interactive` 模式从终端 TUI（架构文档 §2.3，复用 `pi-tui`）换成 Web 工作台（架构文档 §2.14 `RemoteSession`）。**MVP 完全可以不用 GUI**：直接用 `office-agent` 的 TUI + 办公工具（phase-2）就能办公。GUI 是为了更好的"预览/产物管理"体验，且全程复用 `RemoteSession`，不重造会话/协议。

---

## 1. 功能需求（FR）

| 编号 | 需求 | 说明 |
|---|---|---|
| FR-3.1 | 经 `RemoteSession` 连接后端（经 phase-0 的桥 / 或直连 Node 端） | 复用 `coding-agent/client`，不重写连接 |
| FR-3.2 | 渲染对话流 `TranscriptItem`（user/assistant/tool） | 直接消费 `RemoteSession.state.transcript`，**不自己写归约** |
| FR-3.3 | 预览面板：pdf/png 直接显示；docx/xlsx/pptx 经 `delivery.convert`→pdf 再显示；html 用 **iframe sandbox** | 安全红线（设计文档 §6.3 坑3） |
| FR-3.4 | 产物列表：从 `ToolTranscriptItem.details.artifacts` 提取 `ArtifactRef`，可下载 / 在预览面板打开 | 多版本报告=分支树叶子 |
| FR-3.5 | 分支导航：复用 coding-agent 会话分支机制（phase-0 说明），通过 `RemoteSession` 的会话列表/`setModel` 等能力体现 | 不另开字段 |
| FR-3.6 | 发送用户输入（自然语言请求） | `session.submit(text)`（真实 API） |

---

## 2. 对外组件契约（TS，全部基于已有类型）

```typescript
// office-gui/src/types.ts
// 不定义会话/对话类型——直接 import 已有包的类型：
import type { SessionSnapshot, TranscriptItem, ToolTranscriptItem } from "@earendil-works/pi-protocol";
import type { RemoteSessionState, RemoteSession } from "@earendil-works/coding-agent/client";

// 办公域增量（仅约定，非新协议类型）：
export interface ArtifactRef {
  kind: "docx" | "xlsx" | "pptx" | "png" | "pdf" | "html";
  path: string;
  previewUrl?: string;
  label: string;
}

// 从一段 transcript 提取产物（工具执行结果挂在 tool item 的 details 上）：
export function extractArtifacts(transcript: readonly TranscriptItem[]): ArtifactRef[] {
  const out: ArtifactRef[] = [];
  for (const item of transcript) {
    if (item.role !== "tool") continue;
    const details = (item as ToolTranscriptItem).details as { artifacts?: ArtifactRef[] } | undefined;
    if (details?.artifacts) out.push(...details.artifacts);
  }
  return out;
}
```

> `WorkbenchSession` 不再自创——直接用 `RemoteSession`：`subscribe((state: RemoteSessionState) => …)` 给 `state.transcript` / `state.snapshot`，`submit(text)` 发消息。

---

## 3. 关键实现草图

### 3.1 连接后端（FR-3.1，真实 API）

```typescript
// office-gui/src/backend.ts
import { RemoteSession } from "@earendil-works/coding-agent/client";

// 浏览器端经 phase-0 的 WebSocket 桥；桥内已用 RemoteSession 连好后端。
// 这里只做"接收 state JSON → 反序列化为 RemoteSessionState 形状"。
export async function openWorkbench(ws: WebSocket): Promise<{
  onState(cb: (state: RemoteSessionState) => void): void;
  submit(text: string): void;
}> {
  const listeners = new Set<(s: RemoteSessionState) => void>();
  ws.onmessage = (ev) => {
    const state = JSON.parse(ev.data) as RemoteSessionState;
    listeners.forEach((l) => l(state));
  };
  return {
    onState(cb) { listeners.add(cb); },
    submit(text) { ws.send(JSON.stringify({ text })); }, // 桥转调 RemoteSession.submit
  };
}

// 若 office-gui 跑在 Node 端（非浏览器），则直接：
// const session = await RemoteSession.create(client, { cwd });
// session.subscribe((state) => render(state.transcript, state.snapshot));
// await session.submit("帮我写一份季度总结 docx");
```

### 3.2 预览渲染（FR-3.3，HTML 沙箱是安全红线）

```tsx
function PreviewPane({ artifact }: { artifact?: ArtifactRef }) {
  if (!artifact) return <EmptyPreview/>;
  switch (artifact.kind) {
    case "pdf": case "png":
      return <iframe src={artifact.previewUrl} title={artifact.label} />;
    case "docx": case "xlsx": case "pptx":
      return <iframe src={artifact.previewUrl /* 已由后端 delivery.convert→pdf */} />;
    case "html":
      // 关键：sandbox 禁脚本执行，仅展示；需要交互预览时走独立沙箱服务
      return <iframe src={artifact.previewUrl} sandbox="allow-same-origin" title={artifact.label} />;
  }
}
```

### 3.3 技术选型

- **构建**：Vite + React + TypeScript（与 monorepo ESM 约定一致）。
- **状态**：直接订阅 `RemoteSessionState`（transcript 已归约好），用 React 局部 state 即可，无需额外全局 store。
- **类型来源**：`TranscriptItem`/`SessionSnapshot` 从 `@earendil-works/pi-protocol` 仅作 `import type`（零运行时）；`RemoteSession` 从 `@earendil-works/coding-agent/client`。
- **启动方式**：`vite dev` 独立跑；phase-4 由 `office-agent` 的 office 模式自动拉起（桥随之启动）。

---

## 4. 验收标准（AC）

- [ ] AC-3.1 浏览器打开工作台，能经桥连接后端并完成一次"写 docx"对话（全程用 `RemoteSession`，未自写连接/归约）。
- [ ] AC-3.2 生成的 `.docx` 在预览面板以 PDF 形态可见（验证 `delivery.convert` 链路）。
- [ ] AC-3.3 HTML 产物在 `iframe sandbox` 中预览，无脚本逃逸（安全审查通过）。
- [ ] AC-3.4 产物列表由 `extractArtifacts(state.transcript)` 从 `ToolTranscriptItem.details` 提取，点击可下载落盘文件。

---

## 5. 里程碑与退出条件

- **退出条件**：GUI 能驱动一次完整"对话→生成→预览"闭环，消费 phase-2 的 `artifact`，且**会话/对话流逻辑全部来自 `RemoteSession` + `pi-protocol`，无自创协议**。
- phase-4 把"手动 `vite dev` + 手动起桥"变成"`office` 一键启动"。
- **坑提醒**：docx/xlsx/pptx 预览必须经 `delivery.convert` 转 pdf，浏览器无法直接渲染 OOXML；HTML 预览严格 sandbox，禁止 `allow-scripts`（除非走隔离沙箱服务）；GUI 不得自己实现 LLM 调用或对话归约。
