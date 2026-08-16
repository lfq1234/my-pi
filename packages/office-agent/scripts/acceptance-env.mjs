/**
 * 环境自检与自动安装验收（用户要求：my-pi 内检验环境，缺失自动装软件）。
 *
 * 运行：node scripts/acceptance-env.mjs
 * 验证：doctor 报告结构、ensureLibreOffice 自动装路径、convert 仍正常、winget 命令构造。
 */
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const outDir = join(__dirname, "..", "examples", "out-env");
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
	libreOfficeInstallCommand,
	ensureLibreOffice,
	checkEnvironment,
	findLibreOffice,
	convert,
	renderDocx,
} = office;

// ---------------------------------------------------------------------------
console.log("== 安装命令构造（Windows → winget） ==");
const cmd = libreOfficeInstallCommand();
check("Windows 用 winget 安装 LibreOffice", process.platform === "win32" ? cmd[0] === "winget" && cmd.includes("TheDocumentFoundation.LibreOffice") : cmd[0] === "brew" || cmd[0] === "apt-get", cmd.join(" "));
check("命令含静默参数", process.platform === "win32" ? cmd.includes("--silent") : true);

// ---------------------------------------------------------------------------
console.log("\n== ensureLibreOffice（已装直接返回；缺失自动装） ==");
const lo = await ensureLibreOffice();
check("ensureLibreOffice 返回 soffice 路径", typeof lo === "string" && lo.length > 0, String(lo));
check("返回路径真实存在", await exists(lo), lo);
const found = findLibreOffice();
check("findLibreOffice 与 ensure 一致", found === lo);

// ---------------------------------------------------------------------------
console.log("\n== checkEnvironment 报告 ==");
const report = await checkEnvironment({ autoInstall: false });
check("报告含 LibreOffice/字体/浏览器 3 项", report.items.length === 3, report.items.map((i) => i.name).join(","));
check("LibreOffice 项状态正确", report.items[0].ok === (await exists(lo)), report.items[0].detail.slice(0, 80));
check("报告含 allOk 汇总", typeof report.allOk === "boolean");

// ---------------------------------------------------------------------------
console.log("\n== convert 自动装后仍正常（docx → pdf） ==");
const docxPath = join(outDir, "env-check.docx");
await renderDocx({ title: "环境自检", sections: [{ heading: "测试", body: "验证 convert 链路。" }], outPath: docxPath });
check("renderDocx 生成", await exists(docxPath));
const pdfPath = await convert(docxPath, "pdf");
check("convert(docx→pdf) 成功", (await exists(pdfPath)) && pdfPath.endsWith(".pdf"), pdfPath);

// ---------------------------------------------------------------------------
console.log(`\n结果: ${failed === 0 ? "ALL CHECKS PASSED ✔" : `${failed} 项失败`}`);
if (failed > 0) process.exit(1);
