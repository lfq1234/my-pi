/**
 * phase-1 delivery 验收脚本（AC-1.1 ~ AC-1.4）。
 *
 * 运行：node scripts/acceptance.mjs
 * 依赖：已 build（dist/ 存在）、LibreOffice 已安装（convert 用）。
 * 产物输出到 examples/out/。
 */
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const outDir = join(__dirname, "..", "examples", "out");

// 从 dist 导入（与 phase-2 tools import 的是同一入口）
const {
  renderDocx,
  renderXlsx,
  renderPptx,
  compose,
  convert,
  createDocRenderer,
  createPosterComposer,
  findLibreOffice,
} = await import("../dist/index.js");

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

await mkdir(outDir, { recursive: true });

console.log("== AC-1.1 renderDocx + convert(docx→pdf) ==");
const docx = await renderDocx({
  title: "测试文档",
  sections: [
    { heading: "第一章", body: "这是中文正文内容，用于验证 docx 渲染。hello world." },
    { heading: "第二章", body: "第二段内容。" },
  ],
  outPath: join(outDir, "test.docx"),
});
check("renderDocx 返回 DeliveryArtifact", docx.kind === "docx" && typeof docx.bytes === "number" && docx.createdAt > 0);
check("test.docx 存在且非空", (await exists(docx.path)) && docx.bytes > 0, docx.path);

const pdfPath = await convert(docx.path, "pdf");
check("convert(docx→pdf) 返回 pdf 路径", pdfPath.endsWith("test.pdf"));
check("test.pdf 存在且非空", (await exists(pdfPath)) && (await import("node:fs/promises")).stat(pdfPath).then((s) => s.size > 0), pdfPath);

console.log("== AC-1.2 compose 中文海报 ==");
const poster = await compose({
  width: 800,
  height: 450,
  title: "夏日冰饮节",
  subtitle: "第二杯半价 · 仅限本周",
  outPath: join(outDir, "test.png"),
  outKind: "png",
});
check("compose 返回 png artifact", poster.kind === "png");
check("test.png 存在且非空", (await exists(poster.path)) && poster.bytes > 0, poster.path);
// 验证 PNG 是真实图片（sharp 可读 metadata）
const { default: sharp } = await import("sharp");
const meta = await sharp(poster.path).metadata();
check("test.png 尺寸正确", meta.width === 800 && meta.height === 450, `got ${meta.width}x${meta.height}`);

console.log("== AC-1.3 DeliveryArtifact 字段齐全 ==");
const sample = docx;
check(
  "字段齐全 (kind/path/label/bytes/createdAt)",
  ["kind", "path", "label", "bytes", "createdAt"].every((k) => k in sample) && !("previewUrl" in sample) || "previewUrl" in sample,
);
check("kind 合法", ["docx", "xlsx", "pptx", "png", "pdf", "html"].includes(sample.kind));
check("path 为绝对路径", sample.path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(sample.path));

console.log("== AC-1.4 导出契约 ==");
check("导出 renderDocx/renderXlsx/renderPptx", typeof renderDocx === "function" && typeof renderXlsx === "function" && typeof renderPptx === "function");
check("导出 compose", typeof compose === "function");
check("导出 convert", typeof convert === "function");
check("导出 createDocRenderer/createPosterComposer", typeof createDocRenderer === "function" && typeof createPosterComposer === "function");
check("LibreOffice 探测可用", findLibreOffice() !== null);
const renderer = createDocRenderer();
check("DocRenderer 三方法", typeof renderer.renderDocx === "function" && typeof renderer.renderXlsx === "function" && typeof renderer.renderPptx === "function");
const composer = createPosterComposer();
check("PosterComposer.compose", typeof composer.compose === "function");

console.log("== 附加：xlsx / pptx 生成（FR-1.2 / FR-1.3）==");
const xlsx = await renderXlsx({
  sheets: [{ name: "销售", rows: [["产品", "数量"], ["苹果", 3], ["香蕉", 5]] }],
  outPath: join(outDir, "test.xlsx"),
});
check("test.xlsx 存在", await exists(xlsx.path));
const csvPath = await convert(xlsx.path, "csv");
check("convert(xlsx→csv) 存在", await exists(csvPath), csvPath);

const pptx = await renderPptx({
  slides: [{ title: "季度汇报", bullets: ["营收 +12%", "新客 3000"] }],
  outPath: join(outDir, "test.pptx"),
});
check("test.pptx 存在", await exists(pptx.path));

console.log("\n========================================");
if (failures === 0) {
  console.log("ALL CHECKS PASSED ✔  （产物目录: examples/out/）");
  process.exitCode = 0;
} else {
  console.error(`${failures} CHECK(S) FAILED ✘`);
  process.exitCode = 1;
}
