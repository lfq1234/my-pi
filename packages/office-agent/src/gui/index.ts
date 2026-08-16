/**
 * GUI 工作台（phase-3）。
 *
 * 复用 RemoteSession + pi-protocol，GUI 只做渲染与交互；不自己跑 LLM、
 * 不重定义任何协议。产物经 ToolTranscriptItem.details.artifacts 传递。
 */

export {
	openWorkbench,
	RemoteSession,
	type WorkbenchBridge,
	type WorkbenchOptions,
	WorkbenchSession,
} from "./backend.ts";
export {
	createMemoryListener,
	OFFICE_DEMO_MODEL,
	OfficeDemoServerService,
	OfficeDemoSessionRuntime,
	startOfficeDemoServer,
} from "./demo-server.ts";
export { type PreviewDecision, renderPreviewIframe, requiresConvert, resolvePreview } from "./preview.ts";
export {
	renderArtifactList,
	renderPreview,
	renderTranscript,
	renderTranscriptItem,
	renderWorkbench,
} from "./render.ts";
export {
	type ArtifactRef,
	extractArtifacts,
	isBusy,
	type RemoteSessionState,
	type SessionSnapshot,
	type ToolTranscriptItem,
	type TranscriptItem,
} from "./types.ts";
