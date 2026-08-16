/**
 * office 工具汇出（phase-2 §4：镜像 coding-agent 的 createCodingTools）。
 *
 * officeTools 直接注入 Agent（initialState.tools），与 coding-agent 的
 * createCodingTools 完全对等——区别只是领域从"代码"换成"办公文档"。
 */

import { createHtmlGenerateToolDefinition, type HtmlGenerateToolOptions } from "./html/generate-tool.ts";
import { createPosterComposeToolDefinition } from "./poster/compose-tool.ts";
import type { OfficeTool, OfficeToolDefinition } from "./types.ts";
import { createWpsSheetToolDefinition } from "./wps/sheet-tool.ts";
import { createWpsSlideToolDefinition } from "./wps/slide-tool.ts";
import { createWpsWriterToolDefinition } from "./wps/writer-tool.ts";
import { wrapOfficeToolDefinitions } from "./wrapper.ts";

export {
	createHtmlGenerateTool,
	createHtmlGenerateToolDefinition,
	type HtmlGenerateParams,
	type HtmlGenerateToolOptions,
} from "./html/generate-tool.ts";
export {
	createPosterComposeTool,
	createPosterComposeToolDefinition,
	type PosterComposeParams,
} from "./poster/compose-tool.ts";
export type {
	OfficeArtifactDetails,
	OfficeTool,
	OfficeToolDefinition,
	OfficeToolDirection,
	OfficeToolMeta,
} from "./types.ts";
export {
	createWpsSheetTool,
	createWpsSheetToolDefinition,
	type WpsSheetParams,
} from "./wps/sheet-tool.ts";
export {
	createWpsSlideTool,
	createWpsSlideToolDefinition,
	type WpsSlideParams,
} from "./wps/slide-tool.ts";
export {
	createWpsWriterTool,
	createWpsWriterToolDefinition,
	type WpsWriterParams,
} from "./wps/writer-tool.ts";
export { wrapOfficeToolDefinition, wrapOfficeToolDefinitions } from "./wrapper.ts";

export interface OfficeToolsOptions {
	html?: HtmlGenerateToolOptions;
}

export type OfficeToolName = "wps_writer" | "wps_sheet" | "wps_slide" | "poster_compose" | "html_generate";
export const allOfficeToolNames: Set<OfficeToolName> = new Set([
	"wps_writer",
	"wps_sheet",
	"wps_slide",
	"poster_compose",
	"html_generate",
]);

/** 5 个主干工具的定义形态（供 AgentSession 注册 / phase-3 校验） */
export function createOfficeToolDefinitions(options?: OfficeToolsOptions): OfficeToolDefinition<any>[] {
	return [
		createWpsWriterToolDefinition(),
		createWpsSheetToolDefinition(),
		createWpsSlideToolDefinition(),
		createPosterComposeToolDefinition(),
		createHtmlGenerateToolDefinition(options?.html),
	];
}

/** 5 个主干工具实例（注入 Agent 用） */
export function createOfficeTools(options?: OfficeToolsOptions): OfficeTool<any>[] {
	return wrapOfficeToolDefinitions(createOfficeToolDefinitions(options));
}

/** 与 phase-2 文档 §4 对齐：直接给出一份工具实例数组（默认无 LLM 配置，html 走模板兜底） */
export const officeTools: OfficeTool<any>[] = createOfficeTools();
