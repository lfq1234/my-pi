/**
 * office-agent SDK（phase-2 §4：镜像 coding-agent 的 createAgentSession）。
 *
 * 唯一差别：initialState.tools = officeTools（而非 coding 工具）。
 * Agent / streamFn 复用 pi-agent-core + pi-ai/compat，一行引擎代码都不改。
 */
import { Agent, setDefaultStreamFn } from "@earendil-works/pi-agent-core";
import { type Model, streamSimple } from "@earendil-works/pi-ai/compat";
import { OfficeAgentSession, type OfficeAgentSessionOptions } from "./agent-session.ts";
import { type OfficeToolsOptions, officeTools } from "./tools/index.ts";

// 与 coding-agent sdk.ts 一致：给低层 Agent 提供默认流函数（无 model 注入时也能构造）
setDefaultStreamFn(streamSimple);

export interface CreateOfficeAgentSessionOptions extends OfficeAgentSessionOptions {
	cwd?: string;
	agentDir?: string;
	model?: Model<any>;
	/** 办公工具选项（如 html_generate 的 LLM model 注入） */
	tools?: OfficeToolsOptions;
	/** 系统提示（phase-6 提供办公领域提示，缺省给最小占位） */
	systemPrompt?: string;
}

export async function createOfficeAgentSession(
	options: CreateOfficeAgentSessionOptions = {},
): Promise<{ session: OfficeAgentSession; agent?: import("@earendil-works/pi-agent-core").Agent }> {
	const agent = new Agent({
		initialState: {
			model: options.model,
			systemPrompt: options.systemPrompt ?? "",
			tools: officeTools,
		},
		streamFn: streamSimple,
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
