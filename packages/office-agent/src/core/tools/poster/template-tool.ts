/**
 * 海报模板工具（FR-5.5）：内置模板 JSON（社媒/促销/KV）。
 *
 * 模板定义尺寸 + 渐变背景 + 文字点位；execute 直接调 phase-1 的 compose
 * 渲染出带中文的完整海报（比"返回 JSON"更可用，且与 poster_generate 出图、
 * poster_compose 出字解耦）。
 */
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { type Static, Type } from "typebox";
import { compose } from "../../delivery/index.ts";
import type { OfficeTool, OfficeToolDefinition } from "../types.ts";
import { wrapOfficeToolDefinition } from "../wrapper.ts";

export const posterTemplateParams = Type.Object({
	template: Type.Union([Type.Literal("social"), Type.Literal("promo"), Type.Literal("kv")], {
		description: "模板：social=社媒方形 / promo=促销横版 / kv=主视觉大图",
	}),
	title: Type.String({ description: "主标题（中文）" }),
	subtitle: Type.Optional(Type.String({ description: "副标题" })),
	outPath: Type.String({ description: "输出 .png 绝对路径" }),
});

export type PosterTemplateParams = Static<typeof posterTemplateParams>;

export interface PosterTemplate {
	key: "social" | "promo" | "kv";
	name: string;
	width: number;
	height: number;
	/** 渐变背景起止色 */
	from: string;
	to: string;
	subtitleHint: string;
}

/** 内置模板库（社媒/促销/KV 三套）。 */
export const POSTER_TEMPLATES: Record<PosterTemplate["key"], PosterTemplate> = {
	social: {
		key: "social",
		name: "社媒分享",
		width: 1080,
		height: 1080,
		from: "#1e3a5f",
		to: "#3b82f6",
		subtitleHint: "适用于微博/朋友圈/公众号头图",
	},
	promo: {
		key: "promo",
		name: "促销活动",
		width: 800,
		height: 450,
		from: "#7f1d1d",
		to: "#f59e0b",
		subtitleHint: "适用于折扣/上新/限时活动横幅",
	},
	kv: {
		key: "kv",
		name: "主视觉",
		width: 1920,
		height: 1080,
		from: "#111827",
		to: "#0ea5e9",
		subtitleHint: "适用于发布会/品牌主视觉",
	},
};

export function createPosterTemplateToolDefinition(): OfficeToolDefinition<typeof posterTemplateParams> {
	return {
		name: "poster_template",
		label: "海报模板渲染",
		description: "用内置模板（社媒/促销/KV）渲染海报：自动生成渐变背景并排版中文标题/副标题，输出 png。",
		promptSnippet: "用内置模板生成海报",
		parameters: posterTemplateParams,
		meta: { direction: "poster" },
		async execute(_toolCallId, params) {
			const tpl = POSTER_TEMPLATES[params.template];
			const outPath = resolve(params.outPath);
			await mkdir(dirname(outPath), { recursive: true });

			// 用模板生成渐变背景 SVG，交给 compose 排版文字（中文可靠）
			const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tpl.width}" height="${tpl.height}">
  <defs>
    <linearGradient id="t" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${tpl.from}"/>
      <stop offset="1" stop-color="${tpl.to}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#t)"/>
</svg>`;

			const artifact = await compose({
				backgroundImage: Buffer.from(bgSvg),
				width: tpl.width,
				height: tpl.height,
				title: params.title,
				subtitle: params.subtitle,
				outPath,
				outKind: "png",
			});

			return {
				content: [
					{
						type: "text",
						text: `已按模板「${tpl.name}」生成海报：${artifact.path}\n${tpl.subtitleHint}\n尺寸：${tpl.width}x${tpl.height}`,
					},
				],
				details: { artifacts: [artifact] },
			};
		},
	};
}

export function createPosterTemplateTool(): OfficeTool<typeof posterTemplateParams> {
	return wrapOfficeToolDefinition(createPosterTemplateToolDefinition());
}
