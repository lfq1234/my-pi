/**
 * GUI 后端连接（phase-3 FR-3.1 / FR-3.6）。
 *
 * 复用真实 API，不重写连接：
 * - Node 端：PiClient + RemoteSession（coding-agent/client），经 transportFactory 连后端进程
 * - 浏览器端：openWorkbench(ws) —— 极薄桥，只转发 state JSON / submit 文本
 */
import type { PiClient } from "@earendil-works/pi-client";
import {
	RemoteSession,
	type RemoteSessionOptions,
	type RemoteSessionState,
} from "@earendil-works/pi-coding-agent/client";
import type { ModelRef, ThinkingLevel } from "@earendil-works/pi-protocol";

export type { RemoteSessionState, RemoteSessionOptions };
export { RemoteSession };

/** Node 端创建/打开远程会话的参数（真实 RemoteSession.create 入参） */
export interface WorkbenchOptions {
	cwd: string;
	model?: ModelRef;
	thinkingLevel?: ThinkingLevel;
	sessionOptions?: RemoteSessionOptions;
}

/** 浏览器端极薄桥（phase-3 §3.1 openWorkbench）：只转发 state JSON / submit 文本 */
export interface WorkbenchBridge {
	onState(cb: (state: RemoteSessionState) => void): void;
	submit(text: string): void;
	close(): void;
}

export function openWorkbench(ws: WebSocket): WorkbenchBridge {
	const listeners = new Set<(s: RemoteSessionState) => void>();
	ws.onmessage = (ev: MessageEvent) => {
		try {
			const state = JSON.parse(String(ev.data)) as RemoteSessionState;
			for (const listener of listeners) listener(state);
		} catch {
			// 忽略非法帧（桥只转发协议 JSON）
		}
	};
	return {
		onState(cb) {
			listeners.add(cb);
		},
		submit(text) {
			ws.send(JSON.stringify({ text }));
		},
		close() {
			listeners.clear();
			ws.close();
		},
	};
}

/** Node 端会话封装（真实 RemoteSession，供桥进程使用） */
export class WorkbenchSession {
	readonly session: RemoteSession;

	constructor(session: RemoteSession) {
		this.session = session;
	}

	get state(): RemoteSessionState {
		return this.session.state;
	}

	subscribe(listener: (state: RemoteSessionState) => void): () => void {
		return this.session.subscribe(listener);
	}

	async submit(text: string): Promise<void> {
		await this.session.submit(text);
	}

	async dispose(): Promise<void> {
		await this.session.dispose();
	}

	/** 创建新会话（真实 RemoteSession.create） */
	static async create(client: PiClient, options: WorkbenchOptions): Promise<WorkbenchSession> {
		const session = await RemoteSession.create(
			client,
			{ cwd: options.cwd, model: options.model, thinkingLevel: options.thinkingLevel },
			options.sessionOptions,
		);
		return new WorkbenchSession(session);
	}

	/** 打开已有会话（真实 RemoteSession.open） */
	static async open(client: PiClient, sessionId: string, options?: RemoteSessionOptions): Promise<WorkbenchSession> {
		const session = await RemoteSession.open(client, sessionId, options);
		return new WorkbenchSession(session);
	}
}
