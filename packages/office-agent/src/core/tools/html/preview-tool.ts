/**
 * HTML 预览校验工具（FR-5.6，对标 bolt.new 自动修复）。
 *
 * 用 playwright-core + 本机 Edge/Chrome 打开 file:// 页面：截图 + 抓取 console
 * 报错 + 统计资源加载失败，回灌给 html_generate 迭代修复。
 *
 * 无浏览器可用时降级为静态校验（外链/脚本/结构检查），并给出清晰说明。
 */
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { type Static, Type } from "typebox";
import type { OfficeTool, OfficeToolDefinition } from "../types.ts";
import { wrapOfficeToolDefinition } from "../wrapper.ts";

export const htmlPreviewParams = Type.Object({
	htmlPath: Type.String({ description: "待校验的 .html 文件绝对路径" }),
	outDir: Type.Optional(Type.String({ description: "截图输出目录（缺省 html 同目录）" })),
});

export type HtmlPreviewParams = Static<typeof htmlPreviewParams>;

export interface HtmlPreviewToolOptions {
	/** 覆盖浏览器可执行文件路径 */
	executablePath?: string;
	/** 默认工作目录 */
	cwd?: string;
}

/** 找本机浏览器（Edge/Chrome）。 */
function findBrowser(): string | undefined {
	if (process.platform !== "win32") return undefined;
	const candidates = [
		"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
		"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
	];
	for (const p of candidates) {
		try {
			if (existsSync(p)) return p;
		} catch {
			/* ignore */
		}
	}
	return undefined;
}

/** 静态校验降级：外链/资源/结构检查（无浏览器时用）。 */
function staticCheck(html: string): string[] {
	const errors: string[] = [];
	const external = html.match(/<script[^>]+src="(https?:[^"]+)"/gi) ?? [];
	for (const s of external) {
		if (s.includes("cdn.tailwindcss.com") || s.includes("unpkg.com") || s.includes("cdn.jsdelivr.net")) continue;
		errors.push(`外部脚本引用：${s.slice(0, 80)}`);
	}
	if (/<img[^>]+src="(?!data:|https?:|file:)/i.test(html)) {
		errors.push("存在相对路径 <img>，file:// 预览可能加载失败");
	}
	if (!/<html[\s>]/i.test(html)) errors.push("缺少 <html> 根标签");
	if (!/<\/body>/i.test(html)) errors.push("缺少 </body> 闭合");
	return errors;
}

export function createHtmlPreviewToolDefinition(
	options: HtmlPreviewToolOptions = {},
): OfficeToolDefinition<typeof htmlPreviewParams> {
	const cwd = options.cwd ?? process.cwd();
	return {
		name: "html_preview",
		label: "HTML 预览校验",
		description:
			"在沙箱浏览器里打开 HTML，截图并抓取 console 报错，回灌给 html_generate 自动修复。无浏览器时做静态校验。",
		promptSnippet: "预览校验 HTML 页面",
		parameters: htmlPreviewParams,
		meta: { direction: "html" },
		async execute(_toolCallId, params) {
			const htmlPath = resolve(cwd, params.htmlPath);
			const outDir = resolve(cwd, params.outDir ?? dirname(htmlPath));
			await mkdir(outDir, { recursive: true });
			const html = await readFile(htmlPath, "utf8");

			const executablePath = options.executablePath ?? findBrowser();
			if (!executablePath) {
				// 降级：静态校验
				const errors = staticCheck(html);
				return {
					content: [
						{
							type: "text",
							text: `未找到本机浏览器，执行静态校验：\n${errors.length === 0 ? "未发现明显问题" : errors.map((e) => `- ${e}`).join("\n")}\n建议安装 Edge/Chrome 后获得截图能力。`,
						},
					],
					details: { artifacts: [] },
				};
			}

			const screenshotPath = join(outDir, `${basename(htmlPath, ".html")}-preview.png`);
			const consoleErrors: string[] = [];
			try {
				// 动态 require：playwright-core 未装时降级（不破坏其他工具）
				const { chromium } = await import("playwright-core");
				const browser = await chromium.launch({ executablePath, headless: true });
				try {
					const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
					page.on("console", (msg) => {
						if (msg.type() === "error") consoleErrors.push(msg.text());
					});
					page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
					page.on("requestfailed", (req) => {
						consoleErrors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText ?? ""}`);
					});
					await page.goto(`file://${htmlPath.replaceAll("\\", "/")}`, { waitUntil: "load", timeout: 15_000 });
					await page.waitForTimeout(300);
					await page.screenshot({ path: screenshotPath });
				} finally {
					await browser.close();
				}
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				const errors = staticCheck(html);
				return {
					content: [
						{
							type: "text",
							text: `浏览器校验失败：${message.slice(0, 200)}\n已做静态校验：\n${errors.length === 0 ? "未发现明显问题" : errors.map((e) => `- ${e}`).join("\n")}`,
						},
					],
					details: { artifacts: [] },
				};
			}

			const shot = await readFile(screenshotPath);
			const artifact = {
				kind: "png" as const,
				path: screenshotPath,
				label: `${basename(htmlPath, ".html")} 预览截图`,
				bytes: shot.byteLength,
				createdAt: Date.now(),
			};
			return {
				content: [
					{
						type: "text",
						text: `已预览并截图：${screenshotPath}\nconsole 报错：${consoleErrors.length === 0 ? "无" : `\n${consoleErrors.map((e) => `- ${e}`).join("\n")}`}\n可将报错回灌给 html_generate 迭代修复。`,
					},
				],
				details: { artifacts: [artifact] },
			};
		},
	};
}

export function createHtmlPreviewTool(options?: HtmlPreviewToolOptions): OfficeTool<typeof htmlPreviewParams> {
	return wrapOfficeToolDefinition(createHtmlPreviewToolDefinition(options));
}
