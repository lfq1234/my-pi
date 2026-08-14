# 07：Office Agent 接入共用包方案

## 目标

把当前的 Office Agent 从“独立工具包”提升成“真正的 Office 专用 agent”，同时保留现有的 Office 读取 / 生成能力，并在最小范围内接入共享运行时能力。目标是：

1. 先保留现有 Office 解析 / 生成能力
2. 再接通共用包能力
3. 最后形成真正的 office 专用 agent，而不是单独工具包

## 设计原则

### 1. 先保留“业务能力”，后接“平台能力”

当前 Office Agent 已经具备以下核心能力：

- 读取 DOCX / XLSX / PPTX / PDF / 文本内容
- 识别与归一化 Office 文档内容
- 生成 HTML / 报告摘要 / 邮件草稿 / 海报 brief
- 生成 OOXML 文件（Word / Excel / PowerPoint）

这些能力是产品核心，不能因为接公共包而丢失。接入共用包时必须保持兼容。

### 2. 共用包只做通用能力，而不替代业务逻辑

通用包提供的是：

- 统一 agent runtime
- AI model / provider 访问
- 协议和 API 约定
- client / session / UI 能力
- 任务编排基础设施

但不应该吞掉 Office Agent 的领域知识。Office Agent 依然保留：

- 读取 Office 文档
- 生成 Office 套件产物
- 处理文档结构
- 生成 office 专有输出

### 3. 逐步接入，先做“最小可用”的共用接口

不要一上来做大而全的架构重构。分三个阶段：

- 阶段 A：保留现有能力
- 阶段 B：接共用包，做依赖与适配
- 阶段 C：把 Office Agent 做成一个真正的 agent runtime

## 当前状态判断

目前 [packages/office-agent/package.json](../package.json) 仅包含：

- jszip

它仍然是一个功能型工具包，而不是完整的 agent 包。相比 [packages/coding-agent/package.json](../../coding-agent/package.json) 这样的实现方式，它缺少：

- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- `@earendil-works/pi-client`
- `@earendil-works/pi-protocol`
- `@earendil-works/pi-tui`

这些通用能力层。

## 接入方案

### 方案 A：最小依赖接入

在当前 package 中加入共用包依赖，并保留原始 Office 读写模块：

```json
"dependencies": {
  "@earendil-works/pi-agent-core": "^0.84.1",
  "@earendil-works/pi-ai": "^0.84.1",
  "@earendil-works/pi-client": "^0.84.1",
  "@earendil-works/pi-protocol": "^0.84.1",
  "@earendil-works/pi-tui": "^0.84.1",
  "jszip": "3.10.1"
}
```

这样可以：

- 让 office-agent 与 monorepo 中的共享能力形成统一依赖链
- 不强制马上改写业务逻辑
- 把其从工具包升级为 agent 兼容包

### 方案 B：抽象一个 OfficeAgentRuntime

新增一个 runtime 层，负责：

- 统一 agent context
- 任务输入输出模型
- action / tool 调用接口
- 共享工具 registry

关键点：

- Office 的读写功能仍然保留为真正的 tool
- 但 runtime 通过共用包接入标准 agent lifecycle

### 方案 C：保留“domain tools”，接入“platform runtime”

最终结构应当是：

```text
packages/office-agent/
  src/
    core/
      office-agent.ts
      types.ts
    readers/
      office-reader.ts
      pdf-reader.ts
      wps-reader.ts
    writers/
      office-writer.ts
      docx-writer.ts
      xlsx-writer.ts
      pptx-writer.ts
    ingestion/
      parser-router.ts
    runtime/
      office-runtime.ts
      office-agent-runtime.ts
    services/
      email-service.ts
      seedance-service.ts
    tools/
      report-tool.ts
      html-tool.ts
      poster-tool.ts
    workflows/
      office-workflow.ts
      office-multi-agent.ts
```

这样：

- 业务逻辑归属 Office Agent
- shared runtime 提供 platform 能力
- agent 程序仍然是 Office 专用实现，而不是通用 coding-agent

## 接口设计建议

### 1. OfficeAgent runtime 接口

```ts
export interface OfficeAgentContext {
  agentName: string;
  workingDirectory: string;
  files: string[];
  targetFormat?: "docx" | "xlsx" | "pptx" | "html" | "markdown";
  audience?: string;
  style?: string;
}
```

### 2. Office tool registry

```ts
export interface OfficeToolDefinition {
  name: string;
  description: string;
  execute: (input: unknown) => Promise<unknown>;
}
```

### 3. Agent integration surface

- `readOfficeFiles()`
- `writeOfficeDocument()`
- `summarizeOfficeBundle()`
- `generateHtmlReport()`
- `generatePosterBrief()`
- `sendEmailDraft()`

这些 API 都应该保留在 Office Agent 的 domain 层，而不是直接丢给 generic runtime。

## 最合理的落地顺序

### 第一步：保留现有能力

不动现有 Office 解析 / 生成代码；先确保基本工能稳定：

- DOCX 读取
- XLSX 读取
- PPTX 读取
- PDF 读取增强
- Word / Excel / PPT 生成

### 第二步：接通共用包

在 package.json 中加入共用包依赖，并在 runtime 层加 adapter：

- agent runtime adapter
- protocol adapter
- shared tool registry adapter

### 第三步：封装成 office 专用 agent

把 Office Agent 组织成：

- 一个 office 专属 runtime
- 一组 office 专属 tools
- 一套 office 专属 workflow

最终它不是单纯的 parser，也不是单纯的工具包，而是一个真实can-run agent。

## 风险与注意事项

### 1. 不能让共用包强行接管业务逻辑

这是最关键的限制。不能“为了统一 runtime 而改写 Office 领域逻辑”。

### 2. 兼容性必须稳定

Office 生成要保持 OpenXML 兼容，WPS 兼容应作为增强层，而不是主路径。

### 3. 先形成读写闭环，再接 AI / TUI

真正的 agent 效果需要先有：

- 读入真实文件
- 解析真实内容
- 输出真实文档
- 再接 AI 生成总结和 report

## 结论

最合理的实现方式不是“把 Office Agent 直接改造成一个大而全的 generic agent”，而是：

- 保留现有 domain 能力
- 在最小范围内接入共用包提供的 runtime / protocol / client 能力
- 让它逐步成为真正的 Office 专用 agent

这样既不会破坏已有工作，又能沿着 monorepo 的统一能力栈继续成长。
