/**
 * phase-3 office-gui 验收脚本（AC-3.1 ~ AC-3.4）。
 *
 * 运行：node scripts/acceptance-phase3.mjs
 * 依赖：已 build（dist/ 存在）、LibreOffice 已装（docx→pdf 预览）。
 *
 * 闭环：内存 PiServer + office service（内部用 phase-2 Agent+officeTools 驱动）
 * → 真实 PiClient + RemoteSession 连上 → submit("帮我写 docx")
 * → transcript 出现 tool item（details.artifacts 带 docx）
 * → extractArtifacts 提取 → delivery.convert → pdf 预览 → HTML sandbox 检查。
 */
import { access, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PiClient } from "@earendil-works/pi-client";
import { RemoteSession } from "@earendil-works/pi-coding-agent/client";
import { convert } from "../dist/index.js";
import { extractArtifacts, resolvePreview, renderWorkbench, startOfficeDemoServer } from "../dist/index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const outDir = join(__dirname, "..", "examples", "out-phase3");
await mkdir(outDir, { recursive: true });
// 演示后端把 docx 写到 outDir
process.env.OFFICE_DEMO_OUT = join(outDir, "quarterly.docx");

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

console.log("== 启动内存后端（office service + PiServer）==");
const { server, listener } = await startOfficeDemoServer();
check("PiServer started", server.addresses.includes("memory://office-demo"), server.addresses.join(","));

console.log("== AC-3.1 RemoteSession 连接 + 写 docx 对话 ==");
const client = new PiClient({
  transportFactory: (handlers) => listener.connect(handlers),
});
await client.connect();
check("PiClient connected", client.connected);

const session = await RemoteSession.create(client, { cwd: outDir });
check("RemoteSession.create 成功", session.id !== undefined, String(session.id));
check("初始 transcript 为空", session.state.transcript.length === 0);

let lastState;
session.subscribe((state) => {
  lastState = state;
});

await session.submit("帮我写一份季度总结 docx");
await new Promise((r) => setTimeout(r, 500));

check("提交后 transcript 非空", (lastState?.transcript.length ?? 0) > 0, `len=${lastState?.transcript.length}`);
const toolItems = (lastState?.transcript ?? []).filter((i) => i.role === "tool");
check("存在 tool item", toolItems.length > 0, `tools=${toolItems.length}`);

console.log("== AC-3.4 extractArtifacts 提取产物 ==");
const artifacts = extractArtifacts(lastState?.transcript ?? []);
check("提取到 1 个产物", artifacts.length === 1, `count=${artifacts.length}`);
check("产物 kind=docx", artifacts[0]?.kind === "docx", artifacts[0]?.kind);
check("产物字段齐全 (kind/path/label)", !!artifacts[0]?.path && !!artifacts[0]?.label);
const docxPath = artifacts[0]?.path;
check("docx 真实落盘", docxPath ? await exists(docxPath) : false, docxPath);

console.log("== AC-3.2 docx → pdf 预览（delivery.convert 链路）==");
if (docxPath) {
  const pdfPath = await convert(docxPath, "pdf");
  check("convert(docx→pdf) 生成 pdf", pdfPath.endsWith(".pdf") && (await exists(pdfPath)), pdfPath);
  const pdfStat = await stat(pdfPath);
  check("pdf 非空", pdfStat.size > 0, `size=${pdfStat.size}`);
  const preview = resolvePreview({ ...artifacts[0], previewUrl: `file://${pdfPath}` });
  check("预览决策 iframe + pdf", preview.mode === "iframe" && preview.src.includes(".pdf"), JSON.stringify(preview).slice(0, 120));
}

console.log("== AC-3.3 HTML sandbox 检查 ==");
const htmlArtifact = { kind: "html", path: join(outDir, "demo.html"), label: "demo.html" };
const htmlPreview = resolvePreview(htmlArtifact, "http://localhost:4173/preview");
check("html 预览 sandbox=allow-same-origin", htmlPreview.mode === "iframe" && htmlPreview.sandbox === "allow-same-origin", JSON.stringify(htmlPreview));
check("sandbox 不含 allow-scripts", !(htmlPreview.sandbox ?? "").includes("allow-scripts"));

console.log("== 附加：工作台渲染 ==");
const workbenchHtml = renderWorkbench(session.state, { baseUrl: "http://localhost:4173/preview" });
check("工作台包含对话流", workbenchHtml.includes("chat-stream"));
check("工作台包含预览面板", workbenchHtml.includes("preview-frame") || workbenchHtml.includes("preview-empty"));
check("工作台包含产物列表", workbenchHtml.includes("artifact-list"));
check("工作台包含输入框", workbenchHtml.includes("chat-input"));
// html 产物渲染时带 sandbox
const htmlArtifacts = [htmlArtifact];
const { renderArtifactList, renderPreview } = await import("../dist/index.js");
const previewPane = renderPreview([...(lastState?.transcript ?? []), {
  id: "tool-html",
  role: "tool",
  toolCallId: "c",
  toolName: "html_generate",
  input: {},
  content: [],
  details: { artifacts: [htmlArtifact] },
  status: "complete",
  isError: false,
  timestamp: Date.now(),
}], htmlArtifact.path, "http://localhost:4173/preview");
check("预览面板含 sandbox iframe", previewPane.includes('sandbox="allow-same-origin"'), previewPane.slice(0, 100));

await session.dispose();
await client.disconnect?.();
await server.close();

console.log("\n========================================");
if (failures === 0) {
  console.log("ALL CHECKS PASSED ✔  （产物目录: examples/out-phase3/）");
  process.exitCode = 0;
} else {
  console.error(`${failures} CHECK(S) FAILED ✘`);
  process.exitCode = 1;
}
