/**
 * phase-6 提示与模板验收脚本（AC-6.1 ~ AC-6.4）。
 *
 * 运行：node scripts/acceptance-phase6.mjs
 * 依赖：已 build（dist/ 存在）、phase-1/2/5 可用。
 * 产物输出到 examples/out-phase6/。
 *
 * AC-6.1 系统提示含三大方向 + 结构化入参引导
 * AC-6.2 poster_compose 指定 templateId 后风格一致（尺寸/模板数据）
 * AC-6.3 wps_macro 宏引用对象模型速查标准 API
 * AC-6.4 compactOfficeContext 长文本压缩不溢出且保留关键内容
 */
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const outDir = join(__dirname, "..", "examples", "out-phase6");
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
	OFFICE_SYSTEM_PROMPT,
	JSA_REFERENCE_TEXT,
	createPosterComposeTool,
	getPosterTemplate,
	POSTER_TEMPLATE_FILES,
	createWpsMacroTool,
	compactOfficeContext,
	estimateTokens,
} = office;

// ---------------------------------------------------------------------------
console.log("== AC-6.1 系统提示：三大方向 + 结构化入参 ==");
check("提示含三大方向（WPS/海报/HTML）", /WPS 三件套/.test(OFFICE_SYSTEM_PROMPT) && /海报/.test(OFFICE_SYSTEM_PROMPT) && /HTML demo/.test(OFFICE_SYSTEM_PROMPT));
check("提示引导结构化入参（sections/rows/slides）", /sections/.test(OFFICE_SYSTEM_PROMPT) && /rows/.test(OFFICE_SYSTEM_PROMPT) && /slides/.test(OFFICE_SYSTEM_PROMPT));
check("提示含 poster_compose 模板 id 指引", /templateId/.test(OFFICE_SYSTEM_PROMPT) && /social-promo/.test(OFFICE_SYSTEM_PROMPT));
check("提示含对象模型速查（FR-6.3）", JSA_REFERENCE_TEXT.includes("ActiveSheet.Range") && JSA_REFERENCE_TEXT.includes("ActivePresentation.Slides"));

// ---------------------------------------------------------------------------
console.log("\n== AC-6.2 poster_compose 模板风格一致 ==");
check("模板库含 4 个 JSON 模板", POSTER_TEMPLATE_FILES.length === 4, `got ${POSTER_TEMPLATE_FILES.length}`);
const ids = POSTER_TEMPLATE_FILES.map((t) => t.id);
check("模板 id 齐全", ["social-promo", "promo-banner", "kv-hero", "activity-header"].every((id) => ids.includes(id)), ids.join(","));
const tpl = getPosterTemplate("social-promo");
check("模板含字号/颜色/边距规范", Boolean(tpl?.title?.fontSize && tpl?.title?.color && tpl?.title?.marginTop && tpl?.subtitle?.fontSize), JSON.stringify(tpl?.title));

const composeTool = createPosterComposeTool();
const title = "夏日冰饮节";
const subtitle = "第二杯半价 · 仅限本周";
const p1 = join(outDir, "tpl-social-1.png");
const p2 = join(outDir, "tpl-social-2.png");
await composeTool.execute("call-a", {
	templateId: "social-promo",
	title,
	subtitle,
	outPath: p1,
	outKind: "png",
});
await composeTool.execute("call-b", {
	templateId: "social-promo",
	title,
	subtitle,
	outPath: p2,
	outKind: "png",
});
check("模板渲染两次均产出", (await exists(p1)) && (await exists(p2)));
const s1 = await stat(p1);
const s2 = await stat(p2);
check("两次输出尺寸一致（1080x1080 模板规格）", s1.size === s2.size || Math.abs(s1.size - s2.size) < 200, `s1=${s1.size} s2=${s2.size}`);
const sharp = (await import("sharp")).default;
const meta1 = await sharp(p1).metadata();
check("输出为模板尺寸 1080x1080", meta1.width === 1080 && meta1.height === 1080, `${meta1.width}x${meta1.height}`);

// 模板 JSON 文件与注册表一致（源文件真实存在）
const jsonFiles = ["social-promo", "promo-banner", "kv-hero", "activity-header"];
let jsonOk = true;
for (const id of jsonFiles) {
	const jsonPath = join(__dirname, "..", "src", "core", "tools", "poster", "templates", `${id}.json`);
	try {
		const raw = await readFile(jsonPath, "utf8");
		const parsed = JSON.parse(raw);
		if (parsed.id !== id || parsed.width !== getPosterTemplate(id)?.width) jsonOk = false;
	} catch {
		jsonOk = false;
	}
}
check("templates/*.json 源文件与注册表一致", jsonOk);

// ---------------------------------------------------------------------------
console.log("\n== AC-6.3 wps_macro 引用对象模型速查 ==");
const macroTool = createWpsMacroTool({ cwd: outDir });
const macroPath = join(outDir, "ref-macro.js");
await macroTool.execute("call-macro", {
	target: "xlsx",
	instruction: "A 列加粗并填充浅蓝",
	outPath: macroPath,
});
const macro = await readFile(macroPath, "utf8");
check("宏头引用速查标准 API", /ActiveSheet\.Range/.test(macro) && /\.Font\.Bold/.test(macro) && /\.Interior\.Color/.test(macro));
const pptxMacroPath = join(outDir, "ref-macro-pptx.js");
await macroTool.execute("call-macro", { target: "pptx", instruction: "设置幻灯片字体", outPath: pptxMacroPath });
const pptxMacro = await readFile(pptxMacroPath, "utf8");
check("演示宏引用 Slides/TextRange 标准 API", /ActivePresentation\.Slides/.test(pptxMacro) && /TextRange/.test(pptxMacro));

// ---------------------------------------------------------------------------
console.log("\n== AC-6.4 长文档压缩不溢出 ==");
// 构造 > 50k tokens 的文本（50_000 * 4 = 200_000 字符）
const block = "本季度业务持续增长，营收较上季度提升 12%，新增客户 300 家。";
const longText = block.repeat(Math.ceil(200_000 / block.length));
check("输入估算 > 50k tokens", estimateTokens(longText) > 50_000, `est=${estimateTokens(longText)}`);
const compressed = compactOfficeContext(longText);
check("压缩后估算 < 48k tokens", estimateTokens(compressed) < 48_000, `est=${estimateTokens(compressed)}`);
check("压缩保留开头关键内容", compressed.startsWith("本季度业务持续增长"));
check("压缩含省略标记", compressed.includes("已压缩") && compressed.includes("…"));
const short = compactOfficeContext("短文本不压缩");
check("短文本原样返回", short === "短文本不压缩");

// ---------------------------------------------------------------------------
console.log(`\n结果: ${failed === 0 ? "ALL CHECKS PASSED ✔" : `${failed} 项失败`}`);
if (failed > 0) process.exit(1);
