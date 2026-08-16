/**
 * WPS Word 工具（FR-2.1，底层 office-delivery.renderDocx）。
 *
 * 生成 .docx：起草/续写/排版规范化。入参为结构化章节。
 */
import { type Static, Type } from "typebox";
import { renderDocx } from "../../delivery/index.ts";
import type { OfficeTool, OfficeToolDefinition } from "../types.ts";
import { wrapOfficeToolDefinition } from "../wrapper.ts";

export const wpsWriterParams = Type.Object({
	title: Type.String({ description: "文档标题" }),
	sections: Type.Array(
		Type.Object({
			heading: Type.String({ description: "章节标题" }),
			body: Type.String({ description: "章节正文" }),
		}),
		{ description: "结构化章节列表" },
	),
	outPath: Type.String({ description: "输出 .docx 文件的绝对路径" }),
});

export type WpsWriterParams = Static<typeof wpsWriterParams>;

export function createWpsWriterToolDefinition(): OfficeToolDefinition<typeof wpsWriterParams> {
	return {
		name: "wps_writer",
		label: "Word 文档生成",
		description: "生成 Word(.docx) 文档：起草/续写/排版规范化。入参为结构化章节（标题 + 章节列表），返回落盘产物。",
		promptSnippet: "生成 Word 文档（.docx）",
		parameters: wpsWriterParams,
		meta: { direction: "wps" },
		async execute(_toolCallId, params) {
			const artifact = await renderDocx({
				title: params.title,
				sections: params.sections,
				outPath: params.outPath,
			});
			return {
				content: [
					{
						type: "text",
						text: `已生成 Word 文档：${params.title}\n路径：${artifact.path}\n大小：${artifact.bytes} 字节`,
					},
				],
				details: { artifacts: [artifact] },
			};
		},
	};
}

export function createWpsWriterTool(): OfficeTool<typeof wpsWriterParams> {
	return wrapOfficeToolDefinition(createWpsWriterToolDefinition());
}
