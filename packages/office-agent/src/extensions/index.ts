/**
 * office-agent 扩展系统（doc/modules/extensions.md）。
 *
 * 让用户不改 core 代码即可追加自定义办公工具/提示/命令；
 * SDK 通过 `createOfficeAgentSession({ extensions })` 注入（见 core/sdk.ts）。
 * subagent（doc/modules/subagent.md）：进程级多智能体委派工具。
 */

export {
	OFFICE_BUILTIN_AGENTS,
	type OfficeAgentDef,
} from "./agents.ts";
export {
	type AgentScope,
	createOfficeSubagentExtension,
	createOfficeSubagentTool,
	createOfficeSubagentToolDefinition,
	discoverOfficeAgents,
	getAgentByName,
	type OfficeSubagentToolOptions,
	parseAgentMarkdown,
	runSubagentProcess,
	type SubagentDetails,
	type SubagentParams,
	type SubagentResult,
} from "./office-subagent.ts";
export {
	loadOfficeExtensionsFromDir,
	runOfficeExtensions,
} from "./runner.ts";
export type {
	ExtensionRegistration,
	OfficeExtensionAPI,
	OfficeExtensionFactory,
	OfficeInlineExtension,
} from "./types.ts";
