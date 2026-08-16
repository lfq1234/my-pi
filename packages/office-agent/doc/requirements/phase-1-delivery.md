# Phase 1 · 交付库 `office-delivery`（仅是工具依赖，非架构层）

> **阶段目标**：新增 `office-delivery` 库（与 `office-agent` 同级的兄弟包），把"生成/渲染/导出办公产物"的能力沉淀在这里，供 phase-2 的办公工具（`office-agent/src/core/tools/` 内部）`import` 使用。**它本质上是工具的依赖库**（就像 coding-agent 的工具会 `import` `docx`、会 `spawn("bash")` 调外部程序一样，架构文档 §2.6 的工具本来就可以依赖任意库），**不是新架构层、不重造任何引擎（不重造 `pi-*`）**。本阶段**不依赖任何上层包**，仅用 Node 原生 + 轻量 npm 依赖，可独立验收。

---

## 1. 功能需求（FR）

| 编号 | 需求 | 底层 |
|---|---|---|
| FR-1.1 | 生成 `.docx`（文字） | `docx` npm |
| FR-1.2 | 生成 `.xlsx`（表格） | `exceljs` npm |
| FR-1.3 | 生成 `.pptx`（演示） | `pptxgenjs` npm |
| FR-1.4 | 文档格式互转（docx↔pdf、xlsx↔csv） | `libreoffice --headless` |
| FR-1.5 | 海报图片合成（文字层 + 模板，中文精确） | `satori` + `sharp` npm |
| FR-1.6 | PDF 导出（海报/文档转 PDF） | `pdf-lib` / `sharp` |
| FR-1.7 | 统一交付物对象 `DeliveryArtifact` | 自有类型 |

## 2. 对外接口契约（TS）

```typescript
// delivery/src/index.ts
export type ArtifactKind = "docx" | "xlsx" | "pptx" | "png" | "pdf" | "html";

export interface DeliveryArtifact {
  kind: ArtifactKind;
  path: string;            // 落盘绝对路径
  previewUrl?: string;     // 预览用（pdf/png 可直接预览；docx/xlsx/pptx 经 phase-3 转 pdf）
  label: string;           // 产物名，用于 office-gui 列表
  bytes: number;
  createdAt: number;
}

// 三件套生成器（返回一个 Artifact，不关心 LLM 怎么决策）
export interface DocRenderer {
  renderDocx(input: DocInput): Promise<DeliveryArtifact>;
  renderXlsx(input: SheetInput): Promise<DeliveryArtifact>;
  renderPptx(input: SlideInput): Promise<DeliveryArtifact>;
}
export interface DocInput  { title: string; sections: { heading: string; body: string }[]; outPath: string; }
export interface SheetInput{ sheets: { name: string; rows: (string|number)[][] }[]; outPath: string; }
export interface SlideInput{ slides: { title: string; bullets: string[] }[]; outPath: string; }

// 海报合成（即梦出图后，本地叠加文字层）
export interface PosterComposer {
  compose(input: PosterInput): Promise<DeliveryArtifact>;  // 输出 png/pdf
}
export interface PosterInput {
  backgroundImage?: Buffer;   // 文生图层（phase-5 接入即梦）
  width: number; height: number;
  title?: string; subtitle?: string;
  logoPath?: string; qrPath?: string;
  template?: string;          // 模板 id（phase-6）
  outPath: string; outKind: "png" | "pdf";
}

// 格式转换（LibreOffice headless）
export function convert(src: string, targetExt: "pdf"|"csv"|"png"): Promise<string>;
```

## 3. 关键实现草图

### 3.1 docx 生成（FR-1.1）

```typescript
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { writeFile } from "node:fs/promises";

export async function renderDocx(input: DocInput): Promise<DeliveryArtifact> {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: input.title, heading: HeadingLevel.TITLE }),
        ...input.sections.flatMap(s => [
          new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun(s.body)] }),
        ]),
      ],
    }],
  });
  const buf = await Packer.toBuffer(doc);
  await writeFile(input.outPath, buf);
  return { kind: "docx", path: input.outPath, label: input.title, bytes: buf.length, createdAt: Date.now() };
}
```

### 3.2 海报文字层合成（FR-1.5，关键决策：中文本地合成）

```typescript
import satori from "satori";
import sharp from "sharp";

// 把"标题/副标题/Logo/二维码"用 satori 排版成 SVG，再由 sharp 合成到背景图上
export async function compose(input: PosterInput): Promise<DeliveryArtifact> {
  const svg = await satori(
    `<div style="width:${input.width}px;height:${input.height}px;display:flex;flex-direction:column;justify-content:center;...">
       <h1>${input.title ?? ""}</h1>
       <p>${input.subtitle ?? ""}</p>
     </div>`,
    { width: input.width, height: input.height, fonts: [/* 中文字体 */] }
  );
  const textLayer = await sharp(Buffer.from(svg)).png().toBuffer();
  const base = input.backgroundImage
    ? await sharp(input.backgroundImage).composite([{ input: textLayer }]).toBuffer()
    : textLayer;
  const out = input.outKind === "pdf" ? await pngToPdf(base) : base;
  await writeFile(input.outPath, out);
  return { kind: input.outKind, path: input.outPath, label: input.title ?? "poster", bytes: out.length, createdAt: Date.now() };
}
```

### 3.3 LibreOffice 转换（FR-1.4）

```typescript
import { spawn } from "node:child_process";
export function convert(src: string, targetExt: "pdf"|"csv"|"png"): Promise<string> {
  const out = src.replace(/\.[^.]+$/, `.${targetExt}`);
  return new Promise((res, rej) => {
    const p = spawn("libreoffice", ["--headless", "--convert-to", targetExt, "--outdir", dirname(src), src]);
    p.on("exit", c => c === 0 ? res(out) : rej(new Error(`lo exit ${c}`)));
  });
}
```

## 4. 验收标准（AC）

- [ ] AC-1.1 `npm i` 后，脚本调用 `renderDocx` 生成 `test.docx`，用 `convert(...,"pdf")` 转出 `test.pdf`，文件存在且可打开。
- [ ] AC-1.2 `compose` 生成 `test.png`：文字层中文清晰、无乱码（验证 satori+中文字体生效）。
- [ ] AC-1.3 `DeliveryArtifact` 字段齐全，能被 phase-3 的 `office-gui` 直接消费（预览/下载）。
- [ ] AC-1.4 包导出 `DocRenderer`/`PosterComposer`/`convert`/`DeliveryArtifact`，供 `office-tools` 依赖。

## 5. 里程碑与退出条件

- **退出条件**：delivery 包可独立 `renderDocx`/`compose`/`convert` 并产出可预览文件。
- phase-2 的 `office-tools` 将 `import` 本包，不再各自实现 OOXML/合成逻辑。
- **坑提醒**：LibreOffice 必须装在运行环境（CI/容器需预装）；中文字体文件需随包分发或指向系统字体。
