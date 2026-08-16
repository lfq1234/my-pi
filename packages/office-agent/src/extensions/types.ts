/**
 * office-agent 扩展系统类型（doc/modules/extensions.md）。
 *
 * 镜像 coding-agent 的 ExtensionFactory/InlineExtension 形态（真实类型：
 * `ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>`），
 * 只保留办公场景需要的注册能力（工具 / 提示片段 / 命令）。
 */
import type { TSchema } from "typebox";
import type { OfficeToolDefinition } from "../core/tools/types.ts";

/** 扩展可调用的注册 API。 */
export interface OfficeExtensionAPI {
	/** 注册一个办公工具（OfficeToolDefinition 双形态，wrap 后进 Agent）。 */
	registerTool<TParams extends TSchema>(tool: OfficeToolDefinition<TParams>): void;
	/** 注册一段系统提示片段（追加到 OFFICE_SYSTEM_PROMPT 尾部）。 */
	registerPromptSnippet(name: string, snippet: string): void;
	/** 注册一个自定义命令（office run <name> 或扩展内部调度）。 */
	registerCommand(name: string, handler: (args: string[]) => string | Promise<string>): void;
}

/** 扩展工厂：收到扩展 API，注册自身能力。 */
export type OfficeExtensionFactory = (pi: OfficeExtensionAPI) => void | Promise<void>;

/** 内联扩展形态（与 coding-agent InlineExtension 对齐）。 */
export type OfficeInlineExtension = OfficeExtensionFactory | { name: string; factory: OfficeExtensionFactory };

/** 扩展执行结果汇总。 */
export interface ExtensionRegistration {
	tools: OfficeToolDefinition<any>[];
	promptSnippets: string[];
	commands: Map<string, (args: string[]) => string | Promise<string>>;
	errors: { name: string; error: string }[];
}

/** 扩展系统主入口（供 SDK / CLI 注入）。 */
export { loadOfficeExtensionsFromDir, runOfficeExtensions } from "./runner.ts";
