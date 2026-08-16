/**
 * GUI 渲染（phase-3 FR-3.2 / FR-3.4）。
 *
 * 纯函数：把 RemoteSessionState 渲染为 HTML 片段。框架无关（无 React 依赖，
 * 保持 office-agent 的 Node ESM 构建链不变；浏览器端可直接嵌入）。
 *
 * 渲染内容：
 * - 对话流 TranscriptItem（user / assistant / tool）
 * - 预览面板（fr-3.3，经 resolvePreview）
 * - 产物列表（fr-3.4，经 extractArtifacts）
 */

import type { RemoteSessionState } from "@earendil-works/pi-coding-agent/client";
import type { TranscriptItem } from "@earendil-works/pi-protocol";
import { renderPreviewIframe } from "./preview.ts";
import { extractArtifacts } from "./types.ts";

function esc(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function textContent(item: TranscriptItem): string {
	if (item.role === "user") {
		return item.content
			.filter((c) => c.type === "text")
			.map((c) => (c as { type: "text"; text: string }).text)
			.join("");
	}
	if (item.role === "assistant") {
		return item.content
			.filter((c) => c.type === "text")
			.map((c) => (c as { type: "text"; text: string }).text)
			.join("");
	}
	return "";
}

/** 渲染一条对话项 */
export function renderTranscriptItem(item: TranscriptItem, index: number): string {
	const roleClass = item.role === "user" ? "msg-user" : item.role === "assistant" ? "msg-assistant" : "msg-tool";
	const label =
		item.role === "user"
			? "你"
			: item.role === "assistant"
				? "助手"
				: `工具 (${(item as { toolName?: string }).toolName ?? ""})`;
	const text = textContent(item);
	const input =
		item.role === "tool" && (item as { input?: unknown }).input
			? `<pre class="msg-input">${esc(JSON.stringify((item as { input?: unknown }).input, null, 2))}</pre>`
			: "";
	return `<div class="msg ${roleClass}" data-index="${index}">
    <div class="msg-label">${esc(label)}</div>
    ${input}
    <div class="msg-text">${esc(text)}</div>
  </div>`;
}

/** 渲染对话流 */
export function renderTranscript(transcript: readonly TranscriptItem[]): string {
	if (transcript.length === 0) return '<div class="empty">还没有对话，输入一条消息开始。</div>';
	return transcript.map(renderTranscriptItem).join("\n");
}

/** 渲染产物列表 */
export function renderArtifactList(transcript: readonly TranscriptItem[], _baseUrl = ""): string {
	const artifacts = extractArtifacts(transcript);
	if (artifacts.length === 0) return '<div class="empty">暂无产物。</div>';
	return `<ul class="artifact-list">
    ${artifacts
			.map(
				(a, i) => `<li class="artifact-item">
          <span class="artifact-kind">${esc(a.kind)}</span>
          <span class="artifact-label" title="${esc(a.path)}">${esc(a.label)}</span>
          <a class="artifact-open" data-index="${i}" href="#" data-path="${esc(a.path)}">预览</a>
          <a class="artifact-download" data-path="${esc(a.path)}" download>下载</a>
        </li>`,
			)
			.join("\n")}
  </ul>`;
}

/** 渲染当前选中产物的预览面板 */
export function renderPreview(transcript: readonly TranscriptItem[], selectedPath?: string, baseUrl = ""): string {
	const artifacts = extractArtifacts(transcript);
	const selected = artifacts.find((a) => a.path === selectedPath) ?? artifacts.at(-1);
	if (!selected) return '<div class="preview-empty">选择一个产物查看预览。</div>';
	return `<div class="preview-header">${esc(selected.label)} <span class="preview-kind">${esc(selected.kind)}</span></div>${renderPreviewIframe(selected, baseUrl)}`;
}

/** 渲染完整工作台 HTML（Node 端桥可用；浏览器端可注入同一逻辑） */
export function renderWorkbench(
	state: RemoteSessionState,
	options: { baseUrl?: string; selectedPath?: string } = {},
): string {
	const { baseUrl = "", selectedPath } = options;
	const busy = state.lifecycle.status === "busy";
	return `<div class="workbench">
  <aside class="sidebar">
    <h2>产物</h2>
    ${renderArtifactList(state.transcript, baseUrl)}
  </aside>
  <main class="main">
    <section class="chat">
      <h2>对话</h2>
      <div class="chat-stream">${renderTranscript(state.transcript)}</div>
      <form class="chat-input" id="chat-form">
        <input id="chat-text" type="text" placeholder="例如：帮我写一份季度总结 docx" autocomplete="off" />
        <button type="submit" ${busy ? "disabled" : ""}>${busy ? "生成中…" : "发送"}</button>
      </form>
    </section>
    <section class="preview">
      <h2>预览</h2>
      ${renderPreview(state.transcript, selectedPath, baseUrl)}
    </section>
  </main>
</div>`;
}
