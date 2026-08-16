/**
 * office-tools 类型定义（phase-2 §2）。
 *
 * 镜像 coding-agent 的工具双形态（Definition + AgentTool），但只保留运行时
 * 必需的字段，不引入 coding-agent 的 TUI 渲染字段（renderCall/renderResult）。
 * AgentTool 类型来自 pi-agent-core（真实导出），office 不依赖 coding-agent 包。
 */
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Static, TSchema } from "typebox";
import type { DeliveryArtifact } from "../types.ts";

/** 办公工具方向 */
export type OfficeToolDirection = "wps" | "poster" | "html";

/** 工具元数据（供 office-gui 分组展示） */
export interface OfficeToolMeta {
	direction: OfficeToolDirection;
}

/**
 * 工具执行结果中携带的交付物（phase-2 §2.1：落到 ToolTranscriptItem.details，
 * office-gui 的 extractArtifacts 直接消费）。
 */
export interface OfficeArtifactDetails {
	artifacts: DeliveryArtifact[];
}

/**
 * office 工具定义（轻量双形态之一）。
 * execute 返回 AgentToolResult<OfficeArtifactDetails>，details 携带 artifacts。
 */
export interface OfficeToolDefinition<TParams extends TSchema = TSchema> {
	name: string;
	label: string;
	description: string;
	/** 可选的一句话提示（phase-6 系统提示拼接用） */
	promptSnippet?: string;
	parameters: TParams;
	execute(
		toolCallId: string,
		params: Static<TParams>,
		signal?: AbortSignal,
	): Promise<AgentToolResult<OfficeArtifactDetails>>;
	meta: OfficeToolMeta;
}

/** AgentTool 形态（pi-agent-core 真实类型，注入 Agent 用） */
export type OfficeTool<TParams extends TSchema = TSchema> = AgentTool<TParams, OfficeArtifactDetails>;

/** 工具工厂约定的返回类型：createXxxToolDefinition → OfficeToolDefinition */
export type { AgentToolResult, Static, TSchema };
