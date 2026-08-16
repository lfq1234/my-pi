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

export const posterComposeParams = Type.Object({
	width: Type.Number({ description: "画布宽度（px）" }),
	height: Type.Number({ description: "画布高度（px）" }),
	title: Type.Optional(Type.String({ description: "主标题" })),
	subtitle: Type.Optional(Type.String({ description: "副标题" })),
	backgroundImagePath: Type.Optional(Type.String({ description: "背景图文件路径（缺省时纯文字层）" })),
	logoPath: Type.Optional(Type.String({ description: "Logo 图片路径（左上角）" })),
	qrPath: Type.Optional(Type.String({ description: "二维码图片路径（右下角）" })),
	outPath: Type.String({ description: "输出文件绝对路径" }),
	outKind: Type.Union([Type.Literal("png"), Type.Literal("pdf")], { description: "输出格式" }),
});

export type PosterComposeParams = Static<typeof posterComposeParams>;

export function createPosterComposeToolDefinition(): OfficeToolDefinition<typeof posterComposeParams> {
	return {
		name: "poster_compose",
		label: "海报文字层合成",
		description: "合成海报：把标题/副标题/Logo/二维码精确排版到背景图上（中文可靠）。输出 png 或 pdf。",
		promptSnippet: "合成海报（文字层 + 模板）",
		parameters: posterComposeParams,
		meta: { direction: "poster" },
		async execute(_toolCallId, params) {
			const backgroundImage = params.backgroundImagePath ? await readFile(params.backgroundImagePath) : undefined;
			const artifact = await compose({
				backgroundImage,
				width: params.width,
				height: params.height,
				title: params.title,
				subtitle: params.subtitle,
				logoPath: params.logoPath,
				qrPath: params.qrPath,
				outPath: params.outPath,
				outKind: params.outKind,
			});
			return {
				content: [
					{
						type: "text",
						text: `已合成海报：${artifact.label}\n路径：${artifact.path}\n大小：${artifact.bytes} 字节`,
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
