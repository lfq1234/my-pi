# Phase 5 · 三大方向深化（叠加增强工具）

> **阶段目标**：在 phase-2 主干工具之上**叠加**增强能力，不破坏已有 5 个工具。本阶段把设计文档 §3.1.2 的"路径 A（JSA 宏/加载项）"、§3.2 的"即梦出图"、§3.3 的"预览校验+部署"落地为 4 个新工具（FR-2.6/2.7/2.9/2.10）。**渐进原则**：每个增强都是"新增工具"，老工具零改动。
>
> **与 coding-agent 的对应（呼应"核心内容不换"）**：这和 coding-agent 后续追加 `grep/find/ls` 等只读工具（架构文档 §2.6）是**同一件事**——工具集只增不减，agent loop / 会话 / 压缩全部不动（都是复用同一套 pi-agent-core 机制）。本阶段新工具同样经 pi-agent-core 的工具注册机制接入 `office-agent`（加进 `officeTools` 数组，或作为 `office-agent` 可加载的扩展，§2.7）。

---

## 1. WPS 方向深化（路径 A 内嵌精修）

| 编号 | 工具 | 文件 | 底层 |
|---|---|---|---|
| FR-5.1 | `createWpsMacroTool` | `wps/macro-tool.ts` | 生成 JSA 宏 → 注入 WPS 执行（需桌面端 WPS） |
| FR-5.2 | WPS 服务端 OpenAPI 回写云文档 | `wps/cloud-tool.ts` | `open.wps.cn` 上传/下载/权限 API |
| FR-5.3 | WebOffice 嵌入编辑区（可选） | `office-gui` 内嵌 | WebOffice Document SDK |

### 1.1 `createWpsMacroTool` 草图（FR-5.1）

```typescript
// 生成 JSA 宏代码字符串 → 通过 WpsInvoke 注入 WPS 执行（设计文档 §3.1.2 路径A）
export function createWpsMacroTool(opts: { wpsPort: number }) {
  return createTool({
    name: "wps_macro",
    description: "生成并执行 JSA 宏，在 WPS 进程内精修文档（单元格格式化/段落排版/生成幻灯片）。需本机安装 WPS。",
    parameters: { target: "docx|xlsx|pptx", instruction: "string" },
    async run(p) {
      const macro = await streamSimple({ /* LLM 生成 JSA 宏 */ });
      const result = await wpsInvoke({ type: p.target === "xlsx" ? "et" : p.target === "pptx" ? "wpp" : "wps",
                                       func: "RunMacro", params: [macro], port: opts.wpsPort });
      return { result };
    },
  });
}
```

> **坑提醒（设计文档 §6.3 坑1）**：JSA 宏/加载项部署复杂（publish.xml、Mac 兼容），**本工具仅作为精修增强**，主路径仍是 phase-2 的文件级生成。不要让 agent 默认走宏。

## 2. 海报方向深化（即梦出图 + 模板库）

| 编号 | 工具 | 文件 | 底层 |
|---|---|---|---|
| FR-5.4 | `createPosterGenerateTool` | `poster/generate-tool.ts` | 即梦 AI / 通义万相 API（文生图） |
| FR-5.5 | `createPosterTemplateTool` | `poster/template-tool.ts` | 内置模板 JSON（社媒/促销/KV） |

### 2.1 `createPosterGenerateTool` 草图（FR-5.4）

```typescript
// 出"图"——交给即梦；出"字"——交给 phase-1 的 compose（设计文档 §3.2.3 决策）
export function createPosterGenerateTool(opts: { jimengApiKey: string }) {
  return createTool({
    name: "poster_generate",
    description: "文生图/图生图，输出背景大图。文字层请用 poster_compose 叠加（中文可靠）。",
    parameters: { prompt: "string", size: "string", style?: "string" },
    async run(p) {
      const imgBuf = await jimengTextToImage({ apiKey: opts.jimengApiKey, prompt: p.prompt, size: p.size });
      const bgPath = saveTemp(imgBuf);
      return { backgroundImagePath: bgPath };  // 交给 poster_compose 合成
    },
  });
}
```

> **关键决策（设计文档 §3.2.3）**：`poster_generate` 只出图，`poster_compose` 只出字，二者解耦。绝不指望文生图出准确中文。

## 3. HTML 方向深化（预览校验 + 部署）

| 编号 | 工具 | 文件 | 底层 |
|---|---|---|---|
| FR-5.6 | `createHtmlPreviewTool` | `html/preview-tool.ts` | Playwright headless 截图 + console 抓取 |
| FR-5.7 | `createHtmlDeployTool` | `html/deploy-tool.ts` | CloudStudio/Netlify/Vercel 静态托管 |

### 3.1 `createHtmlPreviewTool` 草图（FR-5.6，对标 bolt.new 自动修复）

```typescript
export function createHtmlPreviewTool() {
  return createTool({
    name: "html_preview",
    description: "在沙箱里打开 HTML，截图并抓取 console 报错，回灌给 html_generate 自动修复。",
    parameters: { htmlPath: "string" },
    async run(p) {
      const { screenshot, errors } = await playwrightCheck(p.htmlPath); // 沙箱启动，禁外联
      return { screenshotPath: screenshot, consoleErrors: errors };     // 喂回 LLM 迭代
    },
  });
}
```

### 3.2 `createHtmlDeployTool` 草图（FR-5.7）

```typescript
export function createHtmlDeployTool(opts: { provider: "cloudstudio"|"netlify" }) {
  return createTool({
    name: "html_deploy",
    description: "把单文件/站点部署到静态托管，返回访问 URL。",
    parameters: { dirOrFile: "string" },
    async run(p) { return { url: await deployStatic(opts.provider, p.dirOrFile) }; },
  });
}
```

## 4. 验收标准（AC）

- [ ] AC-5.1 WPS 精修：在有 WPS 的机器上，`wps_macro` 能格式化一个 xlsx（无 WPS 环境跳过，但工具可注册）。
- [ ] AC-5.2 海报闭环：`poster_generate`(出图) → `poster_compose`(出字) 串联，产出带中文的完整海报 png。
- [ ] AC-5.3 HTML 闭环：`html_generate` → `html_preview`(截图+报错) → 自动修复 → `html_deploy` 返回 URL。
- [ ] AC-5.4 4 个新工具注册后，phase-2 的 5 个工具行为不变（回归通过）。

## 5. 里程碑与退出条件

- **退出条件**：三大方向全部具备"生成→精修/出图→预览/校验→交付"完整链路，且为**增量叠加**。
- 至此办公智能体功能面完整；phase-6 提升输出质量（提示与模板），不改变工具接口。
