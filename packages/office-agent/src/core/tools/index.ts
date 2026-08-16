/**
 * office 工具汇出（phase-2 §4：镜像 coding-agent 的 createCodingTools；
 * phase-5：叠加 5 个增强工具，渐进原则——老工具零改动）。
 *
 * officeTools 直接注入 Agent（initialState.tools），与 coding-agent 的
 * createCodingTools 完全对等——区别只是领域从"代码"换成"办公文档"。
 */

import { createHtmlDeployToolDefinition, type HtmlDeployToolOptions } from "./html/deploy-tool.ts";
import { createHtmlGenerateToolDefinition, type HtmlGenerateToolOptions } from "./html/generate-tool.ts";
import { createHtmlPreviewToolDefinition, type HtmlPreviewToolOptions } from "./html/preview-tool.ts";
import { createPosterComposeToolDefinition } from "./poster/compose-tool.ts";
import { createPosterGenerateToolDefinition, type PosterGenerateToolOptions } from "./poster/generate-tool.ts";
import { createPosterTemplateToolDefinition } from "./poster/template-tool.ts";
import type { OfficeTool, OfficeToolDefinition } from "./types.ts";
import { createWpsMacroToolDefinition, type WpsMacroToolOptions } from "./wps/macro-tool.ts";
import { createWpsSheetToolDefinition } from "./wps/sheet-tool.ts";
import { createWpsSlideToolDefinition } from "./wps/slide-tool.ts";
import { createWpsWriterToolDefinition } from "./wps/writer-tool.ts";
import { wrapOfficeToolDefinitions } from "./wrapper.ts";

export {
	createHtmlDeployTool,
	createHtmlDeployToolDefinition,
	type HtmlDeployParams,
	type HtmlDeployToolOptions,
} from "./html/deploy-tool.ts";
export {
	createHtmlGenerateTool,
	createHtmlGenerateToolDefinition,
	type HtmlGenerateParams,
	type HtmlGenerateToolOptions,
} from "./html/generate-tool.ts";
export {
	createHtmlPreviewTool,
	createHtmlPreviewToolDefinition,
	type HtmlPreviewParams,
	type HtmlPreviewToolOptions,
} from "./html/preview-tool.ts";
export {
	createPosterComposeTool,
	createPosterComposeToolDefinition,
	type PosterComposeParams,
} from "./poster/compose-tool.ts";
export {
	createPosterGenerateTool,
	createPosterGenerateToolDefinition,
	type PosterGenerateParams,
	type PosterGenerateToolOptions,
} from "./poster/generate-tool.ts";
export {
	createPosterTemplateTool,
	createPosterTemplateToolDefinition,
	POSTER_TEMPLATES,
	type PosterTemplate,
	type PosterTemplateParams,
} from "./poster/template-tool.ts";
export type {
	OfficeArtifactDetails,
	OfficeTool,
	OfficeToolDefinition,
	OfficeToolDirection,
	OfficeToolMeta,
} from "./types.ts";
export {
	createWpsMacroTool,
	createWpsMacroToolDefinition,
	type WpsMacroParams,
	type WpsMacroToolOptions,
} from "./wps/macro-tool.ts";
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
	htmlPreview?: HtmlPreviewToolOptions;
	htmlDeploy?: HtmlDeployToolOptions;
	posterGenerate?: PosterGenerateToolOptions;
	wpsMacro?: WpsMacroToolOptions;
}

export type OfficeToolName =
	| "wps_writer"
	| "wps_sheet"
	| "wps_slide"
	| "wps_macro"
	| "poster_compose"
	| "poster_generate"
	| "poster_template"
	| "html_generate"
	| "html_preview"
	| "html_deploy";
export const allOfficeToolNames: Set<OfficeToolName> = new Set([
	"wps_writer",
	"wps_sheet",
	"wps_slide",
	"wps_macro",
	"poster_compose",
	"poster_generate",
	"poster_template",
	"html_generate",
	"html_preview",
	"html_deploy",
]);

/** 全部工具的定义形态（供 AgentSession 注册 / phase-3 校验） */
export function createOfficeToolDefinitions(options?: OfficeToolsOptions): OfficeToolDefinition<any>[] {
	return [
		// phase-2 主干 5 个（零改动）
		createWpsWriterToolDefinition(),
		createWpsSheetToolDefinition(),
		createWpsSlideToolDefinition(),
		createPosterComposeToolDefinition(),
		createHtmlGenerateToolDefinition(options?.html),
		// phase-5 增强 5 个（渐进叠加）
		createWpsMacroToolDefinition(options?.wpsMacro),
		createPosterGenerateToolDefinition(options?.posterGenerate),
		createPosterTemplateToolDefinition(),
		createHtmlPreviewToolDefinition(options?.htmlPreview),
		createHtmlDeployToolDefinition(options?.htmlDeploy),
	];
}

/** 全部工具实例（注入 Agent 用） */
export function createOfficeTools(options?: OfficeToolsOptions): OfficeTool<any>[] {
	return wrapOfficeToolDefinitions(createOfficeToolDefinitions(options));
}

/** 与 phase-2 文档 §4 对齐：直接给出一份工具实例数组（默认无 LLM 配置，html 走模板兜底） */
export const officeTools: OfficeTool<any>[] = createOfficeTools();
