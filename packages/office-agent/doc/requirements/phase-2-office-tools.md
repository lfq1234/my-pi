# Phase 2 · 办公工具（office-agent 的 `core/tools/`，镜像 coding 工具）

> **阶段目标**：把三大方向的办公能力写成 **`AgentTool`**，放进 **`office-agent` 自己的 `core/tools/`**（镜像 coding-agent 的 `core/tools/`，架构文档 §2.6），并用 **pi-agent-core 的同一套 `AgentTool` / `ToolDefinition` 双形态 + `tool-definition-wrapper` / `wrapRegisteredTools`** 接入 `office-agent` 的 `createAgentSession`（镜像 §2.5）。
>
> 关键认知（用户原话）：**核心内容不换，只是原先编辑代码，现在编辑 WPS 三件套 / 海报 / HTML 展示页了。** 所以本阶段做的，等价于在 coding-agent 里"把 `createCodingTools` 换成 `createOfficeTools`"——工具形态（§2.6）、接入方式（wrapper）**完全复用 pi-agent-core**，区别只是领域从"代码"换成"办公文档"，且这些工具是**新建的 `office-agent` 包内部**的，不是 coding-agent 的扩展。
>
> 工具内部依赖的渲染能力（docx / pptx / satori…）来自 phase-1 的 `office-delivery` 库——那只是**工具依赖的第三方库封装**，不是架构层。

---

## 1. 功能需求（FR）

| 编号 | 工具 | 文件（`office-agent/src/core/tools/`） | 底层（来自 delivery / pi-ai） | 阶段 |
|---|---|---|---|---|
| FR-2.1 | `createWpsWriterTool` | `wps/writer-tool.ts` | office-delivery.renderDocx | 本阶段 |
| FR-2.2 | `createWpsSheetTool` | `wps/sheet-tool.ts` | office-delivery.renderXlsx | 本阶段 |
| FR-2.3 | `createWpsSlideTool` | `wps/slide-tool.ts` | office-delivery.renderPptx | 本阶段 |
| FR-2.4 | `createPosterComposeTool` | `poster/compose-tool.ts` | office-delivery.compose | 本阶段 |
| FR-2.5 | `createHtmlGenerateTool` | `html/generate-tool.ts` | pi-ai 流式 + 单文件落盘 | 本阶段 |
| FR-2.6 | `createWpsMacroTool` | `wps/macro-tool.ts` | JSA 宏注入（路径 A） | phase-5 |
| FR-2.7 | `createPosterGenerateTool` | `poster/generate-tool.ts` | 即梦 / 通义万相 API | phase-5 |
| FR-2.8 | `createPosterTemplateTool` | `poster/template-tool.ts` | 模板库 JSON | phase-6 |
| FR-2.9 | `createHtmlPreviewTool` | `html/preview-tool.ts` | Playwright 沙箱截图 | phase-5 |
| FR-2.10 | `createHtmlDeployTool` | `html/deploy-tool.ts` | 静态托管 API | phase-5 |

## 2. 工具抽象（复用 AgentTool 双形态）

```typescript
// office-agent/src/core/tools/types.ts
import type { AgentTool, ToolDefinition } from "@earendil-works/pi-agent-core";

export interface OfficeToolMeta {
  direction: "wps" | "poster" | "html";
  // 每个工具同时导出 实例(createXxxTool) 与 定义(createXxxToolDefinition)
}
// 约定：createWpsWriterTool(options): AgentTool
//      createWpsWriterToolDefinition(options): ToolDefinition
//      Agent 通过 tool-definition-wrapper 统一接入（与设计文档 §4.1 一致）
```

### 2.1 产物回写约定（复用 pi-protocol 的 `details`，与 phase-0 / phase-3 对齐）

工具 `run()` 返回的 `artifact` 必须能到达前端（`office-gui` 的 `extractArtifacts`）。链路：pi-agent-core 的工具运行时在工具执行完后把结果写入 transcript 的 `ToolTranscriptItem`；我们**复用其既有的 result→transcript 机制**，仅约定把 `artifact` 落到该 item 的 `details` 上（不新增类型，因 `details` 是 `pi-protocol` 开放的 `JsonValue`）：

```typescript
// 工具返回的 artifact 形状（与 phase-0 §3.1 的 ArtifactRef 一致）
interface DeliveryArtifact {
  kind: "docx" | "xlsx" | "pptx" | "png" | "pdf" | "html";
  path: string;
  previewUrl?: string;
  label: string;
}
// 工具运行时把 run() 结果写入 ToolTranscriptItem.details：
//   toolTranscriptItem.details = { artifacts: [DeliveryArtifact] };
// 前端 office-gui 用 extractArtifacts(state.transcript) 读取（phase-3 §2）。
//
// 接入点：复用 pi-agent-core 的 AgentTool 结果处理（architecture §2.6）。
// 若其不自动把结构化返回值写入 details，由 office-tools 提供一个
// tool-definition-wrapper 在不动引擎源码的前提下补齐
// —— 仍复用 pi-protocol 的 details 字段，不另开协议。
```

## 3. 主干工具接口与实现草图

### 3.1 `createWpsWriterTool`（FR-2.1）

```typescript
import { renderDocx } from "@your-org/office-delivery";
export interface WpsWriterParams {
  title: string;
  sections: { heading: string; body: string }[];
  outPath: string;
}
export function createWpsWriterTool() {
  return createTool({
    name: "wps_writer",
    description: "生成 Word(.docx) 文档：起草/续写/排版规范化。入参为结构化章节。",
    parameters: { title: "string", sections: "array", outPath: "string" },
    async run(p: WpsWriterParams) {
      const artifact = await renderDocx({ title: p.title, sections: p.sections, outPath: p.outPath });
      return { artifact };   // artifact 可被 office-gui 预览/下载
    },
  });
}
```

### 3.2 `createHtmlGenerateTool`（FR-2.5，纯本地可跑，无外部 API）

```typescript
import { setDefaultStreamFn, streamSimple } from "@earendil-works/pi-ai/compat";
export interface HtmlGenParams { instruction: string; outPath: string; framework?: "vanilla"|"react-cdn"; }
export function createHtmlGenerateTool() {
  return createTool({
    name: "html_generate",
    description: "自然语言 → 单文件 HTML 展示 demo（Tailwind CDN）。生成后由 office-gui 沙箱预览。",
    parameters: { instruction: "string", outPath: "string", framework: "string?" },
    async run(p: HtmlGenParams) {
      // 走 pi-ai/compat 的 streamSimple（设计文档 §6.3 坑4：复用 StreamFn 约定）
      const html = await streamSimple({
        model: "default",
        messages: [{ role: "user", content: buildHtmlPrompt(p.instruction, p.framework) }],
      });
      await writeFile(p.outPath, sanitizeHtml(html));
      return { artifact: { kind: "html", path: p.outPath, label: p.instruction.slice(0,20) } };
    },
  });
}
```

### 3.3 `createPosterComposeTool`（FR-2.4，依赖 phase-1 compose）

```typescript
export function createPosterComposeTool() {
  return createTool({
    name: "poster_compose",
    description: "合成海报：把标题/副标题/Logo/二维码精确排版到背景图上（中文可靠）。",
    parameters: { width: "number", height: "number", title?: "string", subtitle?: "string", backgroundImagePath?: "string", outPath: "string", outKind: "png|pdf" },
    async run(p) {
      const backgroundImage = p.backgroundImagePath ? await readFile(p.backgroundImagePath) : undefined;
      return { artifact: await compose({ ...p, backgroundImage }) };
    },
  });
}
```

## 4. 工具注册进 Agent（office-agent 自己的 SDK，镜像 §2.5）

> 与 coding-agent 自带 `createCodingTools`（`core/tools/index.ts`，架构文档 §2.6）**完全对等**：coding 工具是 `createReadTool` / `createBashTool`…，办公工具是 `createWpsWriterTool` / …，二者都通过 `tool-definition-wrapper` 包成 `ToolDefinition`，再接入 `Agent`。区别在于——**这些办公工具是 `office-agent` 包内部的，由 `office-agent` 自己的 `createAgentSession` 注入**，而非给 coding-agent 加扩展。

```typescript
// office-agent/src/core/tools/index.ts —— 汇出全部办公工具工厂
export const officeTools = [
  createWpsWriterTool(), createWpsSheetTool(), createWpsSlideTool(),
  createPosterComposeTool(), createHtmlGenerateTool(),
  // phase-5 追加：createWpsMacroTool/createPosterGenerateTool/createHtmlPreviewTool/createHtmlDeployTool
];

// office-agent/src/core/sdk.ts —— 镜像 coding-agent 的 createAgentSession（§2.5）
//   唯一差别：services.tools = officeTools（而非 coding 工具）；默认系统提示 = 办公提示（phase-6）
export function createAgentSession(opts) {
  const services = buildServices(opts);
  services.tools = officeTools;                 // ★ 换领域：把编码工具换成办公工具
  return new AgentSession({ ...opts, services }); // AgentSession 复用 pi-agent-core
}
```

> 这就是"换领域"的全部代码量之一：**一个 `officeTools` 汇总 + 在自家 `createAgentSession` 里把 `services.tools` 指过去**。pi-agent-core 的 agent loop、会话分支树、压缩、3 种模式，一行都不用改——因为是复用的同一套引擎。

## 5. 验收标准（AC）

- [ ] AC-2.1 `office-agent/src/core/tools/` 可独立 `import`，5 个主干工具全部能 `run()` 并返回 `DeliveryArtifact` / `artifact`。
- [ ] AC-2.2 把 `officeTools` 注入 `AgentSession` 后，LLM 在对话中能调用 `wps_writer` 生成真实 `.docx`（落盘存在）。
- [ ] AC-2.3 `html_generate` 在无外部 API 时（用模板兜底）也能产出可打开的单文件 HTML。
- [ ] AC-2.4 工具入参 schema 与 `ToolDefinition` 一致，可被 `tool-definition-wrapper` 解析（设计文档 §4.1）。

## 6. 里程碑与退出条件

- **退出条件**：5 个主干工具可注册并真实产出文件；`office-agent` 的 `createAgentSession` 已镜像完成（注入办公工具）。
- phase-3 的 `office-gui` 通过 `ArtifactRef` 消费这些 `artifact` 做预览。
- phase-5 在此**叠加** `macro / generate / preview / deploy` 四个增强工具，不破坏现有 5 个。
