/**
 * phase-2 office-tools 验收脚本（AC-2.1 ~ AC-2.4）。
 *
 * 运行：node scripts/acceptance-phase2.mjs
 * 依赖：已 build（dist/ 存在）、office-delivery 可用（phase-1）。
 * 产物输出到 examples/out-phase2/。
 *
 * AC-2.2 不依赖真实 LLM：用 fake streamFn（pi-ai EventStream）驱动 Agent
 * 发起 wps_writer 工具调用，验证 agent loop 真实执行工具并落盘 .docx。
 */
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EventStream } from "@earendil-works/pi-ai";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const outDir = join(__dirname, "..", "examples", "out-phase2");
await mkdir(outDir, { recursive: true });

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 从 dist 导入（与 phase-2 tools 同入口）
// ---------------------------------------------------------------------------
const office = await import("../dist/index.js");
const {
  createWpsWriterTool,
  createWpsSheetTool,
  createWpsSlideTool,
  createPosterComposeTool,
  createHtmlGenerateTool,
  createOfficeTools,
  officeTools,
  createOfficeAgentSession,
  renderDocx,
  compose,
} = office;

// ---------------------------------------------------------------------------
// AC-2.1 五个工具独立 run() 并返回 artifact
// ---------------------------------------------------------------------------
console.log("== AC-2.1 工具独立 run() ==");
check("officeTools 至少含 phase-2 的 5 个主干工具", officeTools.length >= 5, `got ${officeTools.length}`);
const names = officeTools.map((t) => t.name).sort();
check(
  "phase-2 主干工具名齐全（渐进叠加，老工具零改动）",
  ["html_generate", "poster_compose", "wps_sheet", "wps_slide", "wps_writer"].every((n) => names.includes(n)),
  names.join(","),
);
check("每个工具都有 TypeBox schema", officeTools.every((t) => t.parameters && t.parameters.type === "object"));

const writerTool = createWpsWriterTool();
const docxPath = join(outDir, "phase2.docx");
const wpsResult = await writerTool.execute("call-1", {
  title: "Phase2 报告",
  sections: [{ heading: "摘要", body: "这是 phase-2 工具验收生成的文档。" }],
  outPath: docxPath,
});
check("wps_writer 返回 content", wpsResult.content.length > 0);
check("wps_writer details.artifacts 携带 docx", wpsResult.details.artifacts[0]?.kind === "docx");
check("phase2.docx 落盘存在", await exists(docxPath));

const sheetTool = createWpsSheetTool();
const xlsxPath = join(outDir, "phase2.xlsx");
const sheetResult = await sheetTool.execute("call-2", {
  sheets: [{ name: "数据", rows: [["名称", "数值"], ["A", 1]] }],
  outPath: xlsxPath,
});
check("wps_sheet 落盘 xlsx", sheetResult.details.artifacts[0]?.kind === "xlsx" && (await exists(xlsxPath)));

const slideTool = createWpsSlideTool();
const pptxPath = join(outDir, "phase2.pptx");
const slideResult = await slideTool.execute("call-3", {
  slides: [{ title: "季度汇报", bullets: ["营收增长", "新客 300"] }],
  outPath: pptxPath,
});
check("wps_slide 落盘 pptx", slideResult.details.artifacts[0]?.kind === "pptx" && (await exists(pptxPath)));

const posterTool = createPosterComposeTool();
const pngPath = join(outDir, "phase2-poster.png");
const posterResult = await posterTool.execute("call-4", {
  width: 600,
  height: 300,
  title: "开工大吉",
  outPath: pngPath,
  outKind: "png",
});
check("poster_compose 落盘 png", posterResult.details.artifacts[0]?.kind === "png" && (await exists(pngPath)));

// ---------------------------------------------------------------------------
// AC-2.3 html_generate 无外部 API 时模板兜底
// ---------------------------------------------------------------------------
console.log("== AC-2.3 html_generate 模板兜底 ==");
const htmlTool = createHtmlGenerateTool(); // 不注入 model → 兜底
const htmlPath = join(outDir, "phase2.html");
const htmlResult = await htmlTool.execute("call-5", {
  instruction: "一个产品介绍页",
  outPath: htmlPath,
});
check("html_generate 落盘 html", htmlResult.details.artifacts[0]?.kind === "html" && (await exists(htmlPath)));
const html = await (await import("node:fs/promises")).readFile(htmlPath, "utf8");
check("html 是完整页面（含 <html>）", html.includes("<html") && html.includes("</html>"));
check("html 含 Tailwind CDN", html.includes("tailwindcss.com"));

// ---------------------------------------------------------------------------
// AC-2.2 注入 AgentSession 后 LLM 调用 wps_writer 真实落盘
// 用 fake streamFn 模拟 LLM 第一轮发 toolCall，第二轮收尾
// ---------------------------------------------------------------------------
console.log("== AC-2.2 Agent + officeTools + fake streamFn ==");
const { Agent } = await import("@earendil-works/pi-agent-core");

function makeAssistantMessage(text, overrides = {}) {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "mock",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: Date.now(),
    ...overrides,
  };
}

let callCount = 0;
const toolDocxPath = join(outDir, "agent-driven.docx");
const fakeAgent = new Agent({
  initialState: { model: undefined, systemPrompt: "办公助手", tools: officeTools },
  streamFn: () => {
    callCount += 1;
    const stream = new EventStream(
      (e) => e.type === "done" || e.type === "error",
      (e) => (e.type === "done" ? e.message : e.error),
    );
    queueMicrotask(() => {
      if (callCount === 1) {
        const msg = makeAssistantMessage("我来生成文档", {
          stopReason: "toolUse",
          content: [
            { type: "text", text: "我来生成文档" },
            {
              type: "toolCall",
              id: "call-wps-1",
              name: "wps_writer",
              arguments: {
                title: "Agent 驱动文档",
                sections: [{ heading: "第一章", body: "由 agent loop 调用工具生成。" }],
                outPath: toolDocxPath,
              },
            },
          ],
        });
        stream.push({ type: "start", partial: msg });
        stream.push({ type: "done", reason: "toolUse", message: msg });
      } else {
        const msg = makeAssistantMessage("文档已生成完毕。");
        stream.push({ type: "start", partial: msg });
        stream.push({ type: "done", reason: "stop", message: msg });
      }
    });
    return stream;
  },
});
await fakeAgent.prompt("帮我写一份 Word 文档");
check("agent loop 执行了 wps_writer 且落盘", await exists(toolDocxPath), toolDocxPath);
check("streamFn 被调用 2 次（工具调用 + 收尾）", callCount === 2, `got ${callCount}`);

// ---------------------------------------------------------------------------
// AC-2.4 schema 与 ToolDefinition 一致，可被 wrapper 解析
// ---------------------------------------------------------------------------
console.log("== AC-2.4 schema / wrapper ==");
const { wrapOfficeToolDefinition } = await import("../dist/index.js");
const defs = office.createOfficeToolDefinitions();
check("createOfficeToolDefinitions 至少返回 phase-2 的 5 个定义", defs.length >= 5, `got ${defs.length}`);
check("定义含 name/label/description/parameters/execute", defs.every((d) => d.name && d.label && d.description && d.parameters && typeof d.execute === "function"));
check("定义含 meta.direction", defs.every((d) => ["wps", "poster", "html"].includes(d.meta.direction)));
const wrapped = wrapOfficeToolDefinition(defs[0]);
check("wrapper 产出 AgentTool（name/execute）", wrapped.name === defs[0].name && typeof wrapped.execute === "function");

// 附加：createOfficeAgentSession 可构造（骨架不炸）
console.log("== 附加：createOfficeAgentSession 构造 ==");
const { session } = await createOfficeAgentSession({ cwd: outDir });
check("createOfficeAgentSession 返回 session", !!session && typeof session.prompt === "function");
check("session 持有 agent", !!session.agent);

console.log("\n========================================");
if (failures === 0) {
  console.log("ALL CHECKS PASSED ✔  （产物目录: examples/out-phase2/）");
  process.exitCode = 0;
} else {
  console.error(`${failures} CHECK(S) FAILED ✘`);
  process.exitCode = 1;
}
