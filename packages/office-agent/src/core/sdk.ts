/**
 * office-agent SDK（phase-2 §4：镜像 coding-agent 的 createAgentSession；
 * phase-7：支持 extensions 扩展系统注入）。
 *
 * 唯一差别：initialState.tools = officeTools（而非 coding 工具）。
 * Agent / streamFn 复用 pi-agent-core + pi-ai/compat，一行引擎代码都不改。
 * extensions（doc/modules/extensions.md）：工厂注册的工具合并进 tools，
 * 提示片段追加到系统提示，同名冲突报错不静默覆盖。
 */
import { Agent, setDefaultStreamFn } from "@earendil-works/pi-agent-core";
import type { StreamFunction } from "@earendil-works/pi-ai";
import { type Model, streamSimple } from "@earendil-works/pi-ai/compat";
import { type OfficeInlineExtension, runOfficeExtensions } from "../extensions/index.ts";
import { OfficeAgentSession, type OfficeAgentSessionOptions } from "./agent-session.ts";
import { OFFICE_SYSTEM_PROMPT } from "./prompt.ts";
import { type OfficeToolsOptions, officeTools } from "./tools/index.ts";
import { wrapOfficeToolDefinitions } from "./tools/wrapper.ts";

// 与 coding-agent sdk.ts 一致：给低层 Agent 提供默认流函数（无 model 注入时也能构造）
setDefaultStreamFn(streamSimple);

export interface CreateOfficeAgentSessionOptions extends OfficeAgentSessionOptions {
	cwd?: string;
	agentDir?: string;
	model?: Model<any>;
	/** 办公工具选项（如 html_generate 的 LLM model 注入） */
	tools?: OfficeToolsOptions;
	/** 系统提示（默认 OFFICE_SYSTEM_PROMPT，FR-4.5 由 SDK 默认装配） */
	systemPrompt?: string;
	/** 覆盖流函数（默认 streamSimple；无 LLM 环境可注入演示流，如 makeOfficeDemoStreamFn） */
	streamFn?: StreamFunction;
	/** 内联扩展（doc/modules/extensions.md）：注册工具/提示/命令，合并进默认装配 */
	extensions?: OfficeInlineExtension[];
}

export async function createOfficeAgentSession(
	options: CreateOfficeAgentSessionOptions = {},
): Promise<{ session: OfficeAgentSession; agent?: import("@earendil-works/pi-agent-core").Agent }> {
	// 跑扩展：收集注册的工具与提示片段
	const ext = await runOfficeExtensions(options.extensions ?? []);
	const extTools = wrapOfficeToolDefinitions(ext.tools);
	const conflict = extTools.find((t) => officeTools.some((o) => o.name === t.name));
	if (conflict) {
		throw new Error(`扩展工具 "${conflict.name}" 与内置 officeTools 同名，请改名后重试。`);
	}
	const tools = [...officeTools, ...extTools];
	const systemPrompt = [options.systemPrompt ?? OFFICE_SYSTEM_PROMPT, ...ext.promptSnippets]
		.filter(Boolean)
		.join("\n\n");

	const agent = new Agent({
		initialState: {
			model: options.model,
			systemPrompt,
			tools,
		},
		streamFn: options.streamFn ?? streamSimple,
	});
	const session = new OfficeAgentSession({
		...options,
		model: options.model,
		agent,
	});
	return { session, agent };
}

export type { OfficeToolsOptions } from "./tools/index.ts";
// Re-export 工具工厂（供 CLI / phase-3 消费）
export { createOfficeToolDefinitions, createOfficeTools, officeTools } from "./tools/index.ts";
