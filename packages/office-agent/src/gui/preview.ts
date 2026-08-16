/**
 * GUI 预览决策（phase-3 FR-3.3，HTML 沙箱是安全红线）。
 *
 * 纯函数：给定 ArtifactRef，返回 iframe 预览所需信息。
 * - pdf/png 直接显示
 * - docx/xlsx/pptx 由桥端 delivery.convert → pdf 后显示（previewUrl 已指向 pdf）
 * - html 必须 sandbox（禁止 allow-scripts），仅静态展示
 */
import type { ArtifactRef } from "./types.ts";

export type PreviewDecision =
	| { mode: "iframe"; src: string; sandbox?: string; title: string }
	| { mode: "none"; reason: string };

/**
 * 解析单个产物的预览决策。
 * @param artifact 产物
 * @param baseUrl 预览静态服务前缀（如 "http://localhost:4173/preview"）；previewUrl 优先
 */
export function resolvePreview(artifact: ArtifactRef, baseUrl = ""): PreviewDecision {
	const title = artifact.label || artifact.path;
	switch (artifact.kind) {
		case "pdf":
		case "png":
			return {
				mode: "iframe",
				src: artifact.previewUrl ?? `${baseUrl}?path=${encodeURIComponent(artifact.path)}`,
				title,
			};
		case "docx":
		case "xlsx":
		case "pptx":
			// 桥端必须先 delivery.convert → pdf；previewUrl 应指向转好的 pdf
			return {
				mode: "iframe",
				src: artifact.previewUrl ?? `${baseUrl}?path=${encodeURIComponent(artifact.path)}`,
				title,
			};
		case "html":
			// 安全红线：sandbox 禁脚本执行，仅展示；交互预览走独立沙箱服务（phase-5）
			return {
				mode: "iframe",
				src: artifact.previewUrl ?? `${baseUrl}?path=${encodeURIComponent(artifact.path)}`,
				sandbox: "allow-same-origin",
				title,
			};
		default:
			return { mode: "none", reason: `Unsupported artifact kind: ${artifact.kind}` };
	}
}

/** 是否需要桥端先做 convert（docx/xlsx/pptx → pdf） */
export function requiresConvert(artifact: ArtifactRef): boolean {
	return artifact.kind === "docx" || artifact.kind === "xlsx" || artifact.kind === "pptx";
}

/** 渲染 iframe 标签（供 Node 端 HTML 生成使用） */
export function renderPreviewIframe(artifact: ArtifactRef, baseUrl = ""): string {
	const decision = resolvePreview(artifact, baseUrl);
	if (decision.mode === "none") {
		return `<div class="preview-empty">${decision.reason}</div>`;
	}
	const sandboxAttr = decision.sandbox ? ` sandbox="${decision.sandbox}"` : "";
	return `<iframe class="preview-frame" src="${escapeHtml(decision.src)}" title="${escapeHtml(decision.title)}"${sandboxAttr}></iframe>`;
}

function escapeHtml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
