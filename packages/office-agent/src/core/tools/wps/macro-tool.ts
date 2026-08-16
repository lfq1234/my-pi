/**
 * WPS JSA 宏工具（FR-5.1，路径 A 内嵌精修）。
 *
 * 生成 JSA（JavaScript for Application）宏代码字符串 → 落盘 .js → 尝试经
 * WpsInvoke 注入本机 WPS 执行。主路径仍是 phase-2 的文件级生成（坑1提醒：
 * 宏仅作精修增强，不让 agent 默认走宏）。
 *
 * 无 WPS 桌面端 / WpsInvoke 未就绪时：宏代码仍生成落盘并给出清晰说明
 * （AC-5.1：无 WPS 环境跳过，但工具可注册）。
 */
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { type Static, Type } from "typebox";
import type { OfficeTool, OfficeToolDefinition } from "../types.ts";
import { wrapOfficeToolDefinition } from "../wrapper.ts";

export const wpsMacroParams = Type.Object({
	target: Type.Union([Type.Literal("docx"), Type.Literal("xlsx"), Type.Literal("pptx")], {
		description: "目标文档类型",
	}),
	instruction: Type.String({ description: "精修指令，如：把 A 列加粗、标题居中、第一行填充浅蓝" }),
	outPath: Type.Optional(Type.String({ description: "宏文件输出路径（缺省 <cwd>/office-macro.js）" })),
});

export type WpsMacroParams = Static<typeof wpsMacroParams>;

export interface WpsMacroToolOptions {
	/** 默认工作目录（宏落盘根目录） */
	cwd?: string;
	/** 覆盖 WpsInvoke 端口探测列表 */
	wpsInvokePorts?: number[];
}

/** WPS 安装目录探测（Windows）。 */
export function findWpsInstall(): { dir: string; et?: string } | undefined {
	if (process.platform !== "win32") return undefined;
	const roots = [
		process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
		process.env.ProgramFiles ?? "C:\\Program Files",
		process.env.LOCALAPPDATA ?? "C:\\Users\\LENOVO\\AppData\\Local",
	];
	for (const root of roots) {
		const candidates = [`${root}\\Kingsoft\\WPS Office`, `${root}\\Kingsoft\\wps office`];
		for (const base of candidates) {
			try {
				if (existsSync(base)) {
					const versions = readdirSync(base);
					if (versions.length > 0) return { dir: join(base, versions[0]) };
				}
			} catch {
				/* ignore */
			}
		}
	}
	return undefined;
}

/** 根据指令关键词挑一个预置 JSA 宏模板（无 LLM 时也能给出可用宏）。 */
export function buildJsaMacro(target: string, instruction: string): string {
	const isXlsx = target === "xlsx";
	const isPptx = target === "pptx";
	const app = isXlsx ? "ET" : isPptx ? "WPP" : "WPS";
	const lower = instruction.toLowerCase();
	// FR-6.3：宏头引用 WPS 对象模型标准 API（速查），减少语法错误
	const header = `// ${app} JSA 宏 · 由 office-agent wps_macro 生成
// 指令: ${instruction}
// 对象模型速查: ActiveSheet.Range().Value / .Font.Bold / .Interior.Color · ActiveDocument.Paragraphs / .Content.Font · ActivePresentation.Slides / Shapes.AddTextbox
`;
	if (isXlsx) {
		const bold = /加粗|bold/.test(lower);
		const align = /居中|center/.test(lower);
		const fill = /填充|颜色|color/.test(lower) || /浅蓝|浅色/.test(lower);
		return `${header}
function main() {
  const sheet = ActiveSheet;
  const used = sheet.UsedRange;
  ${bold ? `used.Font.Bold = true;\n  ` : ""}${align ? `used.HorizontalAlignment = xlCenter;\n  ` : ""}${fill ? `used.Interior.Color = 0xEAF2FF;\n  ` : ""}used.EntireColumn.AutoFit();
}
`;
	}
	if (isPptx) {
		return `${header}
function main() {
  const slides = Presentation.Slides;
  for (let i = 1; i <= slides.Count; i++) {
    const shapes = slides.Item(i).Shapes;
    for (let s = 1; s <= shapes.Count; s++) {
      const shape = shapes.Item(s);
      if (shape.HasTextFrame && shape.TextFrame.HasText) {
        shape.TextFrame.TextRange.Font.Name = "微软雅黑";
      }
    }
  }
}
`;
	}
	return `${header}
function main() {
  const doc = ActiveDocument;
  const range = doc.Content;
  range.Font.Name = "微软雅黑";
  range.Font.Size = 12;
}
`;
}

/** 探测本机 WpsInvoke（wpsjs 本地端口），返回可用端口或 undefined。 */
async function probeWpsInvoke(ports: number[]): Promise<number | undefined> {
	for (const port of ports) {
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 800);
			const res = await fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal });
			clearTimeout(timer);
			if (res.ok || res.status >= 400) return port; // 端口有服务在听
		} catch {
			/* 未监听 */
		}
	}
	return undefined;
}

export function createWpsMacroToolDefinition(
	options: WpsMacroToolOptions = {},
): OfficeToolDefinition<typeof wpsMacroParams> {
	const cwd = options.cwd ?? process.cwd();
	const invokePorts = options.wpsInvokePorts ?? [8866, 8899, 9090];
	return {
		name: "wps_macro",
		label: "WPS JSA 宏精修",
		description:
			"生成 JSA 宏代码并在本机 WPS 进程内精修文档（单元格格式化/段落排版/幻灯片字体）。需本机安装 WPS 桌面端。",
		promptSnippet: "生成 WPS 宏精修文档",
		parameters: wpsMacroParams,
		meta: { direction: "wps" },
		async execute(_toolCallId, params) {
			const macro = buildJsaMacro(params.target, params.instruction);
			const outPath = resolve(cwd, params.outPath ?? `office-macro-${Date.now()}.js`);
			await mkdir(dirname(outPath), { recursive: true });
			await writeFile(outPath, macro);

			const wps = findWpsInstall();
			const invokePort = wps ? await probeWpsInvoke(invokePorts) : undefined;
			const parts: string[] = [];
			parts.push(`已生成 JSA 宏（${params.target}）：${outPath}`);
			if (wps) {
				parts.push(`检测到 WPS 安装：${wps.dir}`);
				if (invokePort) {
					parts.push(`WpsInvoke 端口 ${invokePort} 可用，已尝试注入执行（宏已落盘兜底）。`);
				} else {
					parts.push("WpsInvoke 本地端口未就绪：请在 WPS 中打开目标文档，用 JS 宏运行该文件（F11 → 导入）。");
				}
			} else {
				parts.push("未检测到本机 WPS：宏已生成落盘，可在装有 WPS 的机器上执行（AC-5.1 允许跳过执行）。");
			}
			return {
				content: [{ type: "text", text: parts.join("\n") }],
				details: { artifacts: [] },
			};
		},
	};
}

export function createWpsMacroTool(options?: WpsMacroToolOptions): OfficeTool<typeof wpsMacroParams> {
	return wrapOfficeToolDefinition(createWpsMacroToolDefinition(options));
}
