/**
 * office 工具包装器（phase-2 §2：镜像 coding-agent 的 tool-definition-wrapper，
 * 把 OfficeToolDefinition 包成 AgentTool）。
 *
 * 与 coding-agent 的 wrapToolDefinition 等价，但去掉了 coding-agent 的
 * ExtensionContext 依赖与 TUI 渲染字段，只做 AgentTool 的最小适配。
 */
import type { Static, TSchema } from "typebox";
import type { OfficeTool, OfficeToolDefinition } from "./types.ts";

/** 把 OfficeToolDefinition 包装为 pi-agent-core 的 AgentTool。 */
export function wrapOfficeToolDefinition<TParams extends TSchema>(
	definition: OfficeToolDefinition<TParams>,
): OfficeTool<TParams> {
	return {
		name: definition.name,
		label: definition.label,
		description: definition.description,
		parameters: definition.parameters,
		execute: async (toolCallId, params: Static<TParams>, signal) => definition.execute(toolCallId, params, signal),
	};
}

/** 批量包装。 */
export function wrapOfficeToolDefinitions(definitions: OfficeToolDefinition<any>[]): OfficeTool<any>[] {
	return definitions.map((definition) => wrapOfficeToolDefinition(definition));
}
