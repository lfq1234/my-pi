/**
 * WPS 演示工具（FR-2.3，底层 office-delivery.renderPptx）。
 *
 * 生成 .pptx：标题 + 要点列表的幻灯片集合。
 */
import { type Static, Type } from "typebox";
import { renderPptx } from "../../delivery/index.ts";
import type { OfficeTool, OfficeToolDefinition } from "../types.ts";
import { wrapOfficeToolDefinition } from "../wrapper.ts";

export const wpsSlideParams = Type.Object({
	slides: Type.Array(
		Type.Object({
			title: Type.String({ description: "幻灯片标题" }),
			bullets: Type.Array(Type.String(), { description: "要点列表" }),
		}),
		{ description: "幻灯片列表" },
	),
	outPath: Type.String({ description: "输出 .pptx 文件的绝对路径" }),
});

export type WpsSlideParams = Static<typeof wpsSlideParams>;

export function createWpsSlideToolDefinition(): OfficeToolDefinition<typeof wpsSlideParams> {
	return {
		name: "wps_slide",
		label: "PPT 演示生成",
		description: "生成 PowerPoint(.pptx) 演示：每页含标题与要点列表，返回落盘产物。",
		promptSnippet: "生成 PPT 演示（.pptx）",
		parameters: wpsSlideParams,
		meta: { direction: "wps" },
		async execute(_toolCallId, params) {
			const artifact = await renderPptx({
				slides: params.slides,
				outPath: params.outPath,
			});
			return {
				content: [
					{
						type: "text",
						text: `已生成 PPT 演示：${artifact.label}\n路径：${artifact.path}\n大小：${artifact.bytes} 字节`,
					},
				],
				details: { artifacts: [artifact] },
			};
		},
	};
}

export function createWpsSlideTool(): OfficeTool<typeof wpsSlideParams> {
	return wrapOfficeToolDefinition(createWpsSlideToolDefinition());
}
