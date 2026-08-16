/**
 * WPS 表格工具（FR-2.2，底层 office-delivery.renderXlsx）。
 *
 * 生成 .xlsx：多 sheet 表格，首行加粗表头。
 */
import { type Static, Type } from "typebox";
import { renderXlsx } from "../../delivery/index.ts";
import type { OfficeTool, OfficeToolDefinition } from "../types.ts";
import { wrapOfficeToolDefinition } from "../wrapper.ts";

export const wpsSheetParams = Type.Object({
	sheets: Type.Array(
		Type.Object({
			name: Type.String({ description: "工作表名称" }),
			rows: Type.Array(Type.Array(Type.Union([Type.String(), Type.Number()]), { description: "一行单元格" }), {
				description: "行列表",
			}),
		}),
		{ description: "工作表列表" },
	),
	outPath: Type.String({ description: "输出 .xlsx 文件的绝对路径" }),
});

export type WpsSheetParams = Static<typeof wpsSheetParams>;

export function createWpsSheetToolDefinition(): OfficeToolDefinition<typeof wpsSheetParams> {
	return {
		name: "wps_sheet",
		label: "Excel 表格生成",
		description: "生成 Excel(.xlsx) 表格：多 sheet、行列结构化数据。首行自动加粗为表头，返回落盘产物。",
		promptSnippet: "生成 Excel 表格（.xlsx）",
		parameters: wpsSheetParams,
		meta: { direction: "wps" },
		async execute(_toolCallId, params) {
			const artifact = await renderXlsx({
				sheets: params.sheets,
				outPath: params.outPath,
			});
			return {
				content: [
					{
						type: "text",
						text: `已生成 Excel 表格：${artifact.label}\n路径：${artifact.path}\n大小：${artifact.bytes} 字节`,
					},
				],
				details: { artifacts: [artifact] },
			};
		},
	};
}

export function createWpsSheetTool(): OfficeTool<typeof wpsSheetParams> {
	return wrapOfficeToolDefinition(createWpsSheetToolDefinition());
}
