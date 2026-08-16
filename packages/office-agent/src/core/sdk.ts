/**
 * office-agent SDK（phase-2 §4：镜像 coding-agent 的 createAgentSession）。
 *
 * 唯一差别：initialState.tools = officeTools（而非 coding 工具）。
 * Agent / streamFn 复用 pi-agent-core + pi-ai/compat，一行引擎代码都不改。
 */
import { Agent, setDefaultStreamFn } from "@earendil-works/pi-agent-core";
import type { StreamFunction } from "@earendil-works/pi-ai";
import { type Model, streamSimple } from "@earendil-works/pi-ai/compat";
import { OfficeAgentSession, type OfficeAgentSessionOptions } from "./agent-session.ts";
import { OFFICE_SYSTEM_PROMPT } from "./prompt.ts";
import { type OfficeToolsOptions, officeTools } from "./tools/index.ts";

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
}

export async function createOfficeAgentSession(
	options: CreateOfficeAgentSessionOptions = {},
): Promise<{ session: OfficeAgentSession; agent?: import("@earendil-works/pi-agent-core").Agent }> {
	const agent = new Agent({
		initialState: {
			model: options.model,
			systemPrompt: options.systemPrompt ?? OFFICE_SYSTEM_PROMPT,
			tools: officeTools,
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
