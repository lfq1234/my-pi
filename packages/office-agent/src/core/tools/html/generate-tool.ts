/**
 * HTML 展示页生成工具（FR-2.5，走 pi-ai/compat 的 streamSimple + 模板兜底）。
 *
 * 自然语言 → 单文件 HTML demo（Tailwind CDN）。AC-2.3：无外部 API /
 * 未注入 model 时，用内置模板兜底也能产出可打开的单文件 HTML。
 *
 * 注：phase-2 文档草图的 `streamSimple({ model, messages })` 是伪 API；
 * 真实签名是 `streamSimple(model, context, options)`（三参，返回事件流，`.result()` 取最终消息）。
 */
import { writeFile } from "node:fs/promises";
import type { AssistantMessage, Model, SimpleStreamOptions, StreamFunction } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import { type Static, Type } from "typebox";
import type { OfficeTool, OfficeToolDefinition } from "../types.ts";
import { wrapOfficeToolDefinition } from "../wrapper.ts";

export const htmlGenerateParams = Type.Object({
	instruction: Type.String({ description: "自然语言描述要生成的 HTML 展示页" }),
	outPath: Type.String({ description: "输出 .html 文件的绝对路径" }),
	framework: Type.Optional(
		Type.Union([Type.Literal("vanilla"), Type.Literal("react-cdn")], { description: "技术栈" }),
	),
});

export type HtmlGenerateParams = Static<typeof htmlGenerateParams>;

export interface HtmlGenerateToolOptions {
	/** 可选的 LLM 模型；未提供时走模板兜底（AC-2.3） */
	model?: Model<any>;
	/** 可选的流式函数；缺省用 pi-ai/compat 的 streamSimple */
	streamFn?: StreamFunction<any, SimpleStreamOptions>;
}

/** 转义 HTML 文本，防止注入 */
function esc(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

/** 内置模板兜底：无 LLM 时也能产出可打开的 HTML */
function templateHtml(instruction: string, framework?: string): string {
	const title = esc(instruction.slice(0, 30));
	const body = esc(instruction);
	const frameworkLabel = framework === "react-cdn" ? "React (CDN)" : "Vanilla";
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-50 flex items-center justify-center p-8">
  <main class="max-w-2xl w-full bg-white rounded-2xl shadow-lg p-10">
    <p class="text-xs font-mono text-gray-400 uppercase tracking-widest">${frameworkLabel} · 模板兜底</p>
    <h1 class="mt-3 text-3xl font-bold text-gray-900">${title}</h1>
    <p class="mt-4 text-gray-600 leading-relaxed">${body}</p>
  </main>
</body>
</html>
`;
}

/** 从 assistant 消息里提取纯文本 */
function extractText(message: AssistantMessage): string {
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => (part as { type: "text"; text: string }).text)
		.join("");
}

export function createHtmlGenerateToolDefinition(
	options: HtmlGenerateToolOptions = {},
): OfficeToolDefinition<typeof htmlGenerateParams> {
	const streamFn = options.streamFn ?? streamSimple;
	return {
		name: "html_generate",
		label: "HTML 展示页生成",
		description: "自然语言 → 单文件 HTML 展示 demo（Tailwind CDN）。生成后由 office-gui 沙箱预览。",
		promptSnippet: "生成单文件 HTML 展示页",
		parameters: htmlGenerateParams,
		meta: { direction: "html" },
		async execute(_toolCallId, params) {
			const prompt = buildHtmlPrompt(params.instruction, params.framework);
			let html: string;
			if (options.model) {
				try {
					const stream = streamFn(options.model, {
						messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
					});
					const message = await stream.result();
					const generated = extractText(message).trim();
					html = generated.length > 0 ? generated : templateHtml(params.instruction, params.framework);
				} catch {
					// 无外部 API / 调用失败 → 模板兜底（AC-2.3）
					html = templateHtml(params.instruction, params.framework);
				}
			} else {
				html = templateHtml(params.instruction, params.framework);
			}
			await writeFile(params.outPath, html);
			const artifact = {
				kind: "html" as const,
				path: params.outPath,
				label: params.instruction.slice(0, 20),
				bytes: Buffer.byteLength(html, "utf8"),
				createdAt: Date.now(),
			};
			return {
				content: [
					{
						type: "text",
						text: `已生成 HTML 展示页：${artifact.label}\n路径：${artifact.path}\n大小：${artifact.bytes} 字节`,
					},
				],
				details: { artifacts: [artifact] },
			};
		},
	};
}

export function buildHtmlPrompt(instruction: string, framework?: string): string {
	const fw = framework === "react-cdn" ? "使用 React（CDN script 引入，不用构建）" : "使用原生 HTML/CSS/JS";
	return `请生成一个单文件 HTML 展示页（直接输出完整 HTML 源码，不要用 markdown 代码块包裹）。

要求：
- ${fw}
- 引入 Tailwind CSS CDN（https://cdn.tailwindcss.com）
- 中文字体友好，样式美观现代
- 不要包含外部依赖（除 CDN 外）
- 页面主题：${instruction}`;
}

export function createHtmlGenerateTool(options?: HtmlGenerateToolOptions): OfficeTool<typeof htmlGenerateParams> {
	return wrapOfficeToolDefinition(createHtmlGenerateToolDefinition(options));
}
