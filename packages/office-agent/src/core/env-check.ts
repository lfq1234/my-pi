/**
 * 环境自检与自动安装（用户要求：my-pi 内检验环境，缺失自动装软件，不依赖人工）。
 *
 * 覆盖：LibreOffice（convert 依赖，winget/brew/apt 自动装）、中文字体、浏览器。
 * convert() 找不到 LibreOffice 时自动触发 ensureLibreOffice()；CLI 提供 `office doctor` 汇总检查。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findLibreOffice } from "./delivery/convert.ts";

/** 环境诊断项 */
export interface EnvCheckItem {
	name: string;
	ok: boolean;
	detail: string;
}

/** 环境诊断报告 */
export interface EnvCheckReport {
	items: EnvCheckItem[];
	allOk: boolean;
}

export interface EnsureOptions {
	/** 缺失时是否自动安装（默认 true；CI/只读场景可关） */
	autoInstall?: boolean;
	/** 安装进度回调（CLI 打印用） */
	onInstall?: (tool: string) => void;
}

/** 生成平台对应的 LibreOffice 安装命令（Windows 用 winget，macOS 用 brew，Linux 用 apt/snap）。 */
export function libreOfficeInstallCommand(): string[] {
	if (process.platform === "win32") {
		return [
			"winget",
			"install",
			"--id",
			"TheDocumentFoundation.LibreOffice",
			"-e",
			"--accept-source-agreements",
			"--accept-package-agreements",
			"--silent",
			"--disable-interactivity",
		];
	}
	if (process.platform === "darwin") {
		return ["brew", "install", "--cask", "libreoffice"];
	}
	return ["apt-get", "install", "-y", "libreoffice"];
}

/** 安装 LibreOffice（前台等待完成，最长 10 分钟）。 */
export async function installLibreOffice(onInstall?: (tool: string) => void): Promise<void> {
	const cmd = libreOfficeInstallCommand();
	onInstall?.(`LibreOffice (${cmd.join(" ")})`);
	await new Promise<void>((resolve, reject) => {
		const child = spawn(cmd[0], cmd.slice(1), {
			stdio: "inherit",
			shell: process.platform === "win32",
			windowsHide: true,
		});
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error(`自动安装 LibreOffice 超时（${cmd[0]} ${cmd[1] ?? ""}）`));
		}, 10 * 60_000);
		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on("exit", (code) => {
			clearTimeout(timer);
			if (code === 0) resolve();
			else reject(new Error(`自动安装 LibreOffice 失败 (exit ${code ?? "?"})`));
		});
	});
}

/**
 * 确保 LibreOffice 可用：探测 → 缺失且允许时自动安装 → 重探测。
 * 返回 soffice 可执行文件路径；仍不可用则抛错。
 */
export async function ensureLibreOffice(options: EnsureOptions = {}): Promise<string> {
	const { autoInstall = true, onInstall } = options;
	const found = findLibreOffice();
	if (found) return found;
	if (!autoInstall) {
		throw new Error(
			"未找到 LibreOffice。设置 LIBREOFFICE_PATH 指向 soffice，或开启 autoInstall 自动安装（office doctor）。",
		);
	}
	try {
		await installLibreOffice(onInstall);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`自动安装 LibreOffice 失败：${message}\n可手动安装 https://www.libreoffice.org/ 或设置 LIBREOFFICE_PATH。`,
		);
	}
	const after = findLibreOffice();
	if (after) return after;
	throw new Error(
		"LibreOffice 已尝试自动安装但仍未找到。请手动安装（https://www.libreoffice.org/）或设置 LIBREOFFICE_PATH。",
	);
}

/** 检查中文字体（Windows 常见黑体/雅黑；Linux 常见 Noto/WQY）。 */
export function checkChineseFont(): EnvCheckItem {
	if (process.platform === "win32") {
		const windows = process.env.windir ?? "C:\\Windows";
		const fonts = ["simhei.ttf", "msyh.ttc", "simsun.ttc", "msjh.ttc", "simkai.ttf", "Deng.ttf"];
		const found = fonts.find((f) => existsSync(join(windows, "Fonts", f)));
		return { name: "中文字体", ok: Boolean(found), detail: found ?? "未找到（simhei/msyh/simsun/msjh/simkai/Deng）" };
	}
	const linux = [
		"/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
		"/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
	];
	const found = linux.find((f) => existsSync(f));
	return { name: "中文字体", ok: Boolean(found), detail: found ?? "未找到（Noto/WQY）" };
}

/** 检查浏览器（html_preview 截图依赖 Edge/Chrome）。 */
export function checkBrowser(): EnvCheckItem {
	if (process.platform !== "win32") {
		return { name: "浏览器", ok: true, detail: "非 Windows 平台不强制检查" };
	}
	const candidates = [
		"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
		"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
	];
	const found = candidates.find((c) => existsSync(c));
	return {
		name: "浏览器",
		ok: Boolean(found),
		detail: found ?? "未找到 Edge/Chrome（html_preview 将降级为静态校验）",
	};
}

/** 汇总环境检查（office doctor 用）；LibreOffice 缺失时按 autoInstall 自动安装。 */
export async function checkEnvironment(options: EnsureOptions = {}): Promise<EnvCheckReport> {
	let lo: EnvCheckItem;
	try {
		const path = await ensureLibreOffice(options);
		lo = { name: "LibreOffice", ok: true, detail: path };
	} catch (error: unknown) {
		lo = { name: "LibreOffice", ok: false, detail: error instanceof Error ? error.message : String(error) };
	}
	const items = [lo, checkChineseFont(), checkBrowser()];
	return { items, allOk: items.every((i) => i.ok) };
}

/** 打印诊断报告（office doctor 输出）。 */
export function printEnvReport(report: EnvCheckReport): void {
	for (const item of report.items) {
		console.log(`${item.ok ? "✅" : "❌"} ${item.name}: ${item.detail}`);
	}
	console.log(report.allOk ? "\n环境就绪 ✔" : "\n存在缺失项，请按提示处理。");
}
