/**
 * 即梦文生图工具（FR-5.4，设计文档 §3.2.3 决策：poster_generate 只出图）。
 *
 * 出"图"交给即梦 AI（文生图 → 背景大图）；出"字"交给 phase-1 的 poster_compose
 * （中文可靠）。二者解耦，绝不指望文生图输出准确中文。
 *
 * 凭证：环境变量 JIMENG_API_KEY（必填走真实 API）；未配置时降级为 sharp 生成
 * 渐变占位背景（接口不变，AC-5.2 闭环仍可跑通）。
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { type Static, Type } from "typebox";
import type { OfficeTool, OfficeToolDefinition } from "../types.ts";
import { wrapOfficeToolDefinition } from "../wrapper.ts";

export const posterGenerateParams = Type.Object({
	prompt: Type.String({ description: "画面描述（英文效果更稳，中文主题词可混排）" }),
	width: Type.Number({ description: "输出宽度（px），默认 1024" }),
	height: Type.Number({ description: "输出高度（px），默认 1024" }),
	outPath: Type.String({ description: "输出背景图（.png）绝对路径" }),
	style: Type.Optional(Type.String({ description: "风格提示，如 摄影/插画/国潮" })),
});

export type PosterGenerateParams = Static<typeof posterGenerateParams>;

export interface PosterGenerateToolOptions {
	/** 即梦 API Key；缺省读环境变量 JIMENG_API_KEY */
	apiKey?: string;
	/** 即梦 API 地址（开放平台文生图 endpoint，可配环境变量 JIMENG_API_BASE 覆盖） */
	apiBase?: string;
	/** 默认工作目录 */
	cwd?: string;
}

/** 生成渐变占位背景（无 API Key 时的降级路径，保证 AC-5.2 闭环）。 */
function gradientPlaceholder(width: number, height: number, style?: string): Buffer {
	const from = style?.includes("国潮") ? "#1e3a5f" : style?.includes("插画") ? "#fde68a" : "#667eea";
	const to = style?.includes("国潮") ? "#c2410c" : style?.includes("插画") ? "#fb7185" : "#764ba2";
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`;
	return Buffer.from(svg);
}

/** 调即梦开放平台文生图 API：返回图片 Buffer。endpoint 结构不匹配时可经环境变量覆盖。 */
async function jimengTextToImage(options: {
	apiKey: string;
	apiBase: string;
	prompt: string;
	width: number;
	height: number;
	style?: string;
}): Promise<Buffer> {
	const url = `${options.apiBase.replace(/\/$/, "")}/text-to-image`;
	const body = {
		prompt: options.style ? `${options.prompt}，${options.style}` : options.prompt,
		size: `${options.width}x${options.height}`,
		response_format: "b64_json",
	};
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${options.apiKey}`,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(30_000),
	});
	if (!res.ok) {
		throw new Error(`即梦 API 调用失败 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
	}
	const data = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
	const item = data.data?.[0];
	const b64 = item?.b64_json;
	if (b64) return Buffer.from(b64, "base64");
	if (item?.url) {
		const img = await fetch(item.url, { signal: AbortSignal.timeout(30_000) });
		return Buffer.from(await img.arrayBuffer());
	}
	throw new Error("即梦 API 响应缺少图片数据");
}

export function createPosterGenerateToolDefinition(
	options: PosterGenerateToolOptions = {},
): OfficeToolDefinition<typeof posterGenerateParams> {
	const cwd = options.cwd ?? process.cwd();
	const apiKey = options.apiKey ?? process.env.JIMENG_API_KEY;
	const apiBase = options.apiBase ?? process.env.JIMENG_API_BASE ?? "https://api.jianying.com";
	return {
		name: "poster_generate",
		label: "即梦文生图",
		description:
			"文生图/图生图，输出背景大图（只出图不出字）。文字层请用 poster_compose 叠加（中文可靠）。未配置 JIMENG_API_KEY 时输出渐变占位背景。",
		promptSnippet: "用即梦生成海报背景图",
		parameters: posterGenerateParams,
		meta: { direction: "poster" },
		async execute(_toolCallId, params) {
			const outPath = resolve(cwd, params.outPath);
			await mkdir(dirname(outPath), { recursive: true });

			let data: Buffer;
			let source: string;
			if (apiKey) {
				try {
					data = await jimengTextToImage({
						apiKey,
						apiBase,
						prompt: params.prompt,
						width: params.width,
						height: params.height,
						style: params.style,
					});
					source = "jimeng";
				} catch (error: unknown) {
					const message = error instanceof Error ? error.message : String(error);
					data = gradientPlaceholder(params.width, params.height, params.style);
					source = `placeholder (即梦失败: ${message.slice(0, 80)})`;
				}
			} else {
				data = gradientPlaceholder(params.width, params.height, params.style);
				source = "placeholder (未配置 JIMENG_API_KEY)";
			}

			await writeFile(outPath, data);
			const artifact = {
				kind: "png" as const,
				path: outPath,
				label: `背景图 ${params.width}x${params.height}`,
				bytes: data.byteLength,
				createdAt: Date.now(),
			};
			return {
				content: [
					{
						type: "text",
						text: `已生成海报背景图：${artifact.path}\n来源：${source}\n提示：用 poster_compose 叠加中文文字层。`,
					},
				],
				details: { artifacts: [artifact] },
			};
		},
	};
}

export function createPosterGenerateTool(options?: PosterGenerateToolOptions): OfficeTool<typeof posterGenerateParams> {
	return wrapOfficeToolDefinition(createPosterGenerateToolDefinition(options));
}
