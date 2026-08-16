/**
 * 海报合成工具（FR-2.4，底层 office-delivery.compose）。
 *
 * 把标题/副标题/Logo/二维码精确排版到背景图上（中文可靠）。
 */
import { readFile } from "node:fs/promises";
import { type Static, Type } from "typebox";
import { compose } from "../../delivery/index.ts";
import type { OfficeTool, OfficeToolDefinition } from "../types.ts";
import { wrapOfficeToolDefinition } from "../wrapper.ts";
import { getPosterTemplate } from "./template-registry.ts";

export const posterComposeParams = Type.Object({
	width: Type.Optional(Type.Number({ description: "画布宽度（px），缺省用模板宽度或 800" })),
	height: Type.Optional(Type.Number({ description: "画布高度（px），缺省用模板高度或 450" })),
	title: Type.Optional(Type.String({ description: "主标题" })),
	subtitle: Type.Optional(Type.String({ description: "副标题" })),
	backgroundImagePath: Type.Optional(Type.String({ description: "背景图文件路径（缺省时纯文字层）" })),
	logoPath: Type.Optional(Type.String({ description: "Logo 图片路径（左上角）" })),
	qrPath: Type.Optional(Type.String({ description: "二维码图片路径（右下角）" })),
	templateId: Type.Optional(
		Type.String({
			description: "内置模板 id（social-promo/promo-banner/kv-hero/activity-header），决定字号/颜色/边距",
		}),
	),
	outPath: Type.String({ description: "输出文件绝对路径" }),
	outKind: Type.Union([Type.Literal("png"), Type.Literal("pdf")], { description: "输出格式" }),
});

export type PosterComposeParams = Static<typeof posterComposeParams>;

export function createPosterComposeToolDefinition(): OfficeToolDefinition<typeof posterComposeParams> {
	return {
		name: "poster_compose",
		label: "海报文字层合成",
		description:
			"合成海报：把标题/副标题/Logo/二维码精确排版到背景图上（中文可靠）。可用 templateId 指定内置模板统一风格。输出 png 或 pdf。",
		promptSnippet: "合成海报（文字层 + 模板）",
		parameters: posterComposeParams,
		meta: { direction: "poster" },
		async execute(_toolCallId, params) {
			const backgroundImage = params.backgroundImagePath ? await readFile(params.backgroundImagePath) : undefined;
			const tpl = params.templateId ? getPosterTemplate(params.templateId) : undefined;
			const width = params.width ?? tpl?.width ?? 800;
			const height = params.height ?? tpl?.height ?? 450;
			const templateSpec = tpl
				? {
						title: {
							fontSize: tpl.title.fontSize,
							weight: tpl.title.weight,
							color: tpl.title.color,
							marginTop: tpl.title.marginTop,
						},
						subtitle: {
							fontSize: tpl.subtitle.fontSize,
							color: tpl.subtitle.color,
							marginTop: tpl.subtitle.marginTop,
						},
					}
				: undefined;
			const artifact = await compose({
				backgroundImage,
				width,
				height,
				title: params.title,
				subtitle: params.subtitle,
				logoPath: params.logoPath,
				qrPath: params.qrPath,
				templateSpec,
				outPath: params.outPath,
				outKind: params.outKind,
			});
			return {
				content: [
					{
						type: "text",
						text: `已合成海报：${artifact.label}\n路径：${artifact.path}\n大小：${artifact.bytes} 字节${tpl ? `\n模板：${tpl.name} (${tpl.id})` : ""}`,
					},
				],
				details: { artifacts: [artifact] },
			};
		},
	};
}

export function createPosterComposeTool(): OfficeTool<typeof posterComposeParams> {
	return wrapOfficeToolDefinition(createPosterComposeToolDefinition());
}
