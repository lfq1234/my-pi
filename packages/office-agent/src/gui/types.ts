/**
 * GUI 类型（phase-3 §2）。
 *
 * 不定义会话/对话类型——直接复用已有包的类型：
 * - TranscriptItem / ToolTranscriptItem / SessionSnapshot 来自 pi-protocol（仅 import type）
 * - RemoteSessionState / RemoteSession 来自 coding-agent/client
 *
 * 办公域增量仅约定 ArtifactRef（与 phase-0 §3.1 一致）与 extractArtifacts 提取函数。
 */

import type { RemoteSessionState } from "@earendil-works/pi-coding-agent/client";
import type { ToolTranscriptItem, TranscriptItem } from "@earendil-works/pi-protocol";

export type { RemoteSessionState } from "@earendil-works/pi-coding-agent/client";
export type { SessionSnapshot, ToolTranscriptItem, TranscriptItem } from "@earendil-works/pi-protocol";

/** 办公产物引用（工具执行结果挂在 ToolTranscriptItem.details.artifacts 上） */
export interface ArtifactRef {
	kind: "docx" | "xlsx" | "pptx" | "png" | "pdf" | "html";
	path: string;
	previewUrl?: string;
	label: string;
}

/** 从一段 transcript 提取产物（phase-3 §2：不自己写归约，只读 details 开放字段） */
export function extractArtifacts(transcript: readonly TranscriptItem[]): ArtifactRef[] {
	const out: ArtifactRef[] = [];
	for (const item of transcript) {
		if (item.role !== "tool") continue;
		const details = (item as ToolTranscriptItem).details as { artifacts?: ArtifactRef[] } | undefined;
		if (details?.artifacts) out.push(...details.artifacts);
	}
	return out;
}

/** 判断一个 state 是否处于忙碌（提交/生成中），供 UI 显示 loading */
export function isBusy(state: RemoteSessionState): boolean {
	return state.lifecycle.status === "busy";
}
