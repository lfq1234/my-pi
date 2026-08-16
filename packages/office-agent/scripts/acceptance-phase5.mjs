/**
 * phase-5 增强工具验收脚本（AC-5.1 ~ AC-5.4）。
 *
 * 运行：node scripts/acceptance-phase5.mjs
 * 依赖：已 build（dist/ 存在）、phase-1/2 可用、本机 Edge（html_preview 截图）。
 * 产物输出到 examples/out-phase5/。
 *
 * AC-5.1 wps_macro 注册 + 宏生成落盘（WPS 执行跳过，本机有 WPS 则探测）
 * AC-5.2 poster_generate(出图) → poster_compose(出字) 串联出带中文 png
 * AC-5.3 html_generate → html_preview(截图/校验) → html_deploy(打包) 闭环
 * AC-5.4 10 个工具注册、phase-2 主干 5 个零改动（配合 phase-2 脚本回归）
 */
import { access, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const outDir = join(__dirname, "..", "examples", "out-phase5");
await mkdir(outDir, { recursive: true });

let failed = 0;
function check(name, cond, extra = "") {
	if (cond) {
		console.log(`  ✅ ${name}`);
	} else {
		failed += 1;
		console.log(`  ❌ ${name} ${extra}`);
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

const office = await import("../dist/index.js");
const {
	createWpsMacroTool,
	createPosterGenerateTool,
	createPosterTemplateTool,
	createHtmlPreviewTool,
	createHtmlDeployTool,
	createHtmlGenerateTool,
	createPosterComposeTool,
	officeTools,
} = office;

// ---------------------------------------------------------------------------
console.log("== AC-5.4 工具注册与渐进叠加 ==");
const names = officeTools.map((t) => t.name);
check("officeTools 共 10 个（5 主干 + 5 增强）", officeTools.length === 10, `got ${officeTools.length}`);
const backbone = ["wps_writer", "wps_sheet", "wps_slide", "poster_compose", "html_generate"];
const enhanced = ["wps_macro", "poster_generate", "poster_template", "html_preview", "html_deploy"];
check("phase-2 主干 5 个名字不变（渐进原则）", backbone.every((n) => names.includes(n)), names.join(","));
check("phase-5 增强 5 个已注册", enhanced.every((n) => names.includes(n)), names.join(","));

// ---------------------------------------------------------------------------
console.log("\n== AC-5.1 wps_macro（宏生成落盘；WPS 执行按环境跳过） ==");
const macroTool = createWpsMacroTool({ cwd: outDir });
const macroPath = join(outDir, "format-cells.js");
const macroRes = await macroTool.execute("call-macro", {
	target: "xlsx",
	instruction: "A 列加粗并填充浅蓝",
	outPath: macroPath,
});
check("wps_macro 返回宏已生成说明", macroRes.content.some((c) => c.text.includes("JSA 宏")), JSON.stringify(macroRes.content[0]?.text).slice(0, 120));
check("wps_macro 宏文件落盘", await exists(macroPath), macroPath);
const macroText = await (await import("node:fs/promises")).readFile(macroPath, "utf8");
check("宏含 JSA 代码（Bold/Fill）", macroText.includes("Font.Bold") || macroText.includes("Interior.Color"));

// ---------------------------------------------------------------------------
console.log("\n== AC-5.2 海报闭环：poster_generate(出图) → poster_compose(出字) ==");
const genTool = createPosterGenerateTool({ cwd: outDir }); // 无 JIMENG_API_KEY → 渐变占位
const bgPath = join(outDir, "bg.png");
const genRes = await genTool.execute("call-gen", {
	prompt: "夏日冰饮 清爽 摄影",
	width: 800,
	height: 450,
	outPath: bgPath,
});
check("poster_generate 出背景图", await exists(bgPath), bgPath);
check("poster_generate 返回 artifact(kind=png)", (genRes.details?.artifacts ?? []).some((a) => a.kind === "png"));

const composeTool = createPosterComposeTool();
const posterPath = join(outDir, "poster-final.png");
const composeRes = await composeTool.execute("call-compose", {
	width: 800,
	height: 450,
	title: "夏日冰饮节",
	subtitle: "第二杯半价 · 仅限本周",
	backgroundImagePath: bgPath,
	outPath: posterPath,
	outKind: "png",
});
check("poster_compose 出字合成完整海报", await exists(posterPath), posterPath);
const posterStat = await stat(posterPath);
check("合成海报非空", posterStat.size > 1000, `size=${posterStat.size}`);
check("compose details 携带 1 个 artifact", (composeRes.details?.artifacts?.length ?? 0) === 1);

// ---------------------------------------------------------------------------
console.log("\n== AC-5.3 HTML 闭环：generate → preview → deploy ==");
const htmlTool = createHtmlGenerateTool(); // 模板兜底
const htmlPath = join(outDir, "landing.html");
await htmlTool.execute("call-html", { instruction: "夏日冰饮促销落地页", outPath: htmlPath });
check("html_generate 生成 HTML", await exists(htmlPath), htmlPath);

const previewTool = createHtmlPreviewTool({ cwd: outDir });
const previewRes = await previewTool.execute("call-preview", { htmlPath });
const shotArtifact = (previewRes.details?.artifacts ?? []).find((a) => a.kind === "png");
const staticFallback = previewRes.content.some((c) => c.text.includes("静态校验"));
check("html_preview 截图成功（Edge）或静态校验降级", Boolean(shotArtifact) || staticFallback, JSON.stringify(previewRes.content[0]?.text).slice(0, 100));
if (shotArtifact) {
	check("预览截图落盘", await exists(shotArtifact.path), shotArtifact.path);
}
check("html_preview 返回校验文本（含 console 结果）", previewRes.content.some((c) => c.text.includes("报错")), "");

const deployTool = createHtmlDeployTool({ cwd: outDir }); // 无 token → 本地打包
const deployRes = await deployTool.execute("call-deploy", { dirOrFile: htmlPath, provider: "cloudstudio" });
check("html_deploy 返回本地打包结果", deployRes.content.some((c) => c.text.includes("打包")), JSON.stringify(deployRes.content[0]?.text).slice(0, 120));

// ---------------------------------------------------------------------------
console.log(`\n结果: ${failed === 0 ? "ALL CHECKS PASSED ✔" : `${failed} 项失败`}`);
if (failed > 0) process.exit(1);
