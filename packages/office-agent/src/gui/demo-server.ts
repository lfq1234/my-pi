/**
 * AC-3 演示后端（office service + 内存 transport）。
 *
 * 仅用于验收/演示：起一个内存 PiServer，service 内部用 phase-2 的
 * Agent + officeTools 驱动（fake streamFn 模拟 LLM 调用工具，真实生成文件），
 * 让 GUI 用真实 RemoteSession 连上来完成闭环。桥接层复用 pi-protocol 协议，
 * 不重定义任何东西。
 */

import { randomUUID } from "node:crypto";
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { ByteTransport, ByteTransportHandlers } from "@earendil-works/pi-client";
import type {
	JsonValue,
	ModelMetadata,
	ModelRef,
	SessionMetadata,
	SessionPhase,
	SessionSnapshot,
	ThinkingLevel,
	TranscriptItem,
} from "@earendil-works/pi-protocol";
import type {
	CreateSessionOptions,
	PiServerListener,
	PiServerService,
	PiSessionRuntime,
	PiSessionRuntimeEvent,
	PromptInput,
	SteerInput,
} from "@earendil-works/pi-server";
import { PiServer } from "@earendil-works/pi-server";
import type { ByteConnectionAcceptor, ByteConnectionHandler } from "@earendil-works/pi-server/connection";
import { makeOfficeDemoStreamFn } from "../core/demo-stream.ts";
import { OFFICE_SYSTEM_PROMPT } from "../core/prompt.ts";
import { officeTools } from "../core/tools/index.ts";

export const OFFICE_DEMO_MODEL: ModelMetadata = {
	provider: "office-demo",
	id: "demo",
	name: "Office Demo",
	api: "office-demo",
	reasoning: false,
	input: ["text"],
	contextWindow: 16_000,
	maxTokens: 2_000,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	supportedThinkingLevels: ["off"],
	authenticated: true,
};

/** 内存 listener：PiServer 侧用，同时暴露 connect() 给 PiClient 侧 */
export function createMemoryListener(): PiServerListener & {
	connect(handlers: ByteTransportHandlers): ByteTransport;
} {
	let accept: ByteConnectionAcceptor | undefined;

	return {
		address: "memory://office-demo",
		async start(acceptor) {
			accept = acceptor;
		},
		async close() {
			accept = undefined;
		},
		connect(handlers) {
			if (!accept) throw new Error("Memory listener not started");
			// server 侧连接：client.send → server.onData；server.send → client.onData
			const serverHandler: ByteConnectionHandler = accept({
				closed: false,
				send: async (chunk) => handlers.onData(chunk),
				close: () => handlers.onClose(),
			});
			return {
				send: async (chunk) => serverHandler.onData(chunk),
				close: () => serverHandler.onClose(),
			};
		},
	};
}

/** 内存会话 runtime：内部用 office Agent + officeTools 驱动 */
export class OfficeDemoSessionRuntime implements PiSessionRuntime {
	private readonly agent: Agent;
	private readonly listeners = new Set<(event: PiSessionRuntimeEvent) => void>();
	private _snapshot: SessionSnapshot;
	private phase: SessionPhase = "idle";

	constructor(options: {
		id: string;
		cwd: string;
		model: ModelRef;
		thinkingLevel: ThinkingLevel;
		/** 外部注入的 Agent（phase-4 rpc 模式用 createOfficeAgentSession 的默认装配）；缺省用 fake 演示流 */
		agent?: Agent;
	}) {
		this.agent =
			options.agent ??
			new Agent({
				initialState: { model: undefined, systemPrompt: OFFICE_SYSTEM_PROMPT, tools: officeTools },
				streamFn: makeOfficeDemoStreamFn(),
			});
		this._snapshot = {
			id: options.id,
			name: `Session ${options.id}`,
			cwd: options.cwd,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			phase: "idle",
			model: options.model,
			thinkingLevel: options.thinkingLevel,
			attached: false,
			locked: false,
			revision: 0,
			transcript: [],
			queuedSteer: [],
			queuedSteerCount: 0,
		};
	}

	snapshot(): SessionSnapshot {
		return structuredClone(this._snapshot);
	}

	getPhase(): SessionPhase {
		return this.phase;
	}

	async prompt(input: PromptInput): Promise<void> {
		if (this.phase !== "idle") throw new Error("busy");
		this.setPhase("turn");
		// user item
		const userItem: TranscriptItem = {
			id: `user-${this._snapshot.revision + 1}`,
			role: "user",
			content: [{ type: "text", text: input.text }],
			timestamp: Date.now(),
		};
		this.appendTranscript(userItem);
		// 驱动 Agent（fake streamFn 会发起 wps_writer 工具调用并真实生成 docx）
		await this.agent.prompt(input.text);
		// 把 Agent transcript 转成 pi-protocol transcript（含 tool details.artifacts）
		const transcript = toTranscriptItems(this.agent.state.messages, this._snapshot.model);
		this.replaceTranscript(transcript);
		this.setPhase("idle");
	}

	async steer(input: SteerInput): Promise<void> {
		const item: TranscriptItem = {
			id: `user-${this._snapshot.revision + 1}`,
			role: "user",
			content: [{ type: "text", text: input.text }],
			timestamp: Date.now(),
		};
		this._snapshot = {
			...this._snapshot,
			queuedSteer: [...this._snapshot.queuedSteer, item],
			queuedSteerCount: this._snapshot.queuedSteerCount + 1,
			revision: this._snapshot.revision + 1,
			updatedAt: Date.now(),
		};
		this.emit("snapshot");
	}

	async abort(): Promise<void> {
		this.setPhase("idle");
	}

	async setModel(model: ModelRef): Promise<void> {
		this._snapshot = { ...this._snapshot, model, revision: this._snapshot.revision + 1, updatedAt: Date.now() };
		this.emit("snapshot");
	}

	async setThinking(thinkingLevel: ThinkingLevel): Promise<void> {
		this._snapshot = {
			...this._snapshot,
			thinkingLevel,
			revision: this._snapshot.revision + 1,
			updatedAt: Date.now(),
		};
		this.emit("snapshot");
	}

	subscribe(listener: (event: PiSessionRuntimeEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async dispose(): Promise<void> {
		this.listeners.clear();
		// Agent 无显式 dispose，会话结束时由 GC 回收
	}

	private setPhase(phase: SessionPhase): void {
		this.phase = phase;
		this._snapshot = { ...this._snapshot, phase, revision: this._snapshot.revision + 1, updatedAt: Date.now() };
		this.emit("snapshot");
	}

	private appendTranscript(item: TranscriptItem): void {
		this._snapshot = {
			...this._snapshot,
			transcript: [...this._snapshot.transcript, item],
			revision: this._snapshot.revision + 1,
			updatedAt: Date.now(),
		};
		this.emit("snapshot");
	}

	private replaceTranscript(transcript: TranscriptItem[]): void {
		this._snapshot = {
			...this._snapshot,
			transcript,
			revision: this._snapshot.revision + 1,
			updatedAt: Date.now(),
		};
		this.emit("snapshot");
	}

	private emit(event: "snapshot"): void {
		for (const listener of this.listeners) {
			if (event === "snapshot") listener({ type: "snapshot" });
		}
	}
}

/** 内存 service：createSession 返回 office demo runtime */
export class OfficeDemoServerService implements PiServerService {
	private readonly sessions = new Map<string, OfficeDemoSessionRuntime>();
	private readonly agent?: Agent;

	constructor(options?: { agent?: Agent }) {
		this.agent = options?.agent;
	}

	async listSessions(): Promise<SessionMetadata[]> {
		return [...this.sessions.values()].map((r) => {
			const s = r.snapshot();
			return { id: s.id, createdAt: s.createdAt, updatedAt: s.updatedAt, sessionName: s.name, cwd: s.cwd };
		});
	}

	async listModels(): Promise<ModelMetadata[]> {
		return [OFFICE_DEMO_MODEL];
	}

	async createSession(options: CreateSessionOptions): Promise<PiSessionRuntime> {
		const id = options.id ?? randomUUID();
		const runtime = new OfficeDemoSessionRuntime({
			id,
			cwd: options.cwd ?? process.cwd(),
			model: options.model ?? { provider: "office-demo", id: "demo" },
			thinkingLevel: options.thinkingLevel ?? "off",
			agent: this.agent,
		});
		this.sessions.set(id, runtime);
		return runtime;
	}

	async openSession(sessionId: string): Promise<PiSessionRuntime> {
		const runtime = this.sessions.get(sessionId);
		if (!runtime) throw new Error(`Unknown session: ${sessionId}`);
		return runtime;
	}
}

/** 启动内存 PiServer + office service */
export async function startOfficeDemoServer(): Promise<{
	server: PiServer;
	service: OfficeDemoServerService;
	listener: ReturnType<typeof createMemoryListener>;
}> {
	const service = new OfficeDemoServerService();
	const listener = createMemoryListener();
	const server = new PiServer(service, { listeners: [listener], serverId: "office-demo-server" });
	await server.start();
	return { server, service, listener };
}

// ---------------------------------------------------------------------------
// AgentMessage → TranscriptItem 转换（复用 pi-protocol 类型，不重定义协议）
// ---------------------------------------------------------------------------

function toTranscriptItems(messages: readonly AgentMessage[], model: ModelRef): TranscriptItem[] {
	const out: TranscriptItem[] = [];
	for (const message of messages) {
		if (message.role === "user") {
			out.push({
				id: `user-${out.length + 1}`,
				role: "user",
				content: contentToUser(message),
				timestamp: message.timestamp,
			});
		} else if (message.role === "assistant") {
			out.push({
				id: `assistant-${out.length + 1}`,
				role: "assistant",
				content: contentToAssistant(message),
				model,
				status: message.stopReason === "toolUse" ? "complete" : "complete",
				stopReason: message.stopReason === "toolUse" ? "toolUse" : "stop",
				timestamp: message.timestamp,
			});
		} else if (message.role === "toolResult") {
			out.push({
				id: `tool-${out.length + 1}`,
				role: "tool",
				toolCallId: message.toolCallId,
				toolName: message.toolName,
				input: { source: "agent" },
				content: contentToTool(message),
				details: message.details as JsonValue | undefined,
				status: "complete",
				isError: false,
				timestamp: message.timestamp,
			});
		}
	}
	return out;
}

function contentToUser(
	message: Extract<AgentMessage, { role: "user" }>,
): TranscriptItem extends infer _ ? { type: "text"; text: string }[] : never {
	const text =
		typeof message.content === "string"
			? message.content
			: message.content
					.filter((p) => p.type === "text")
					.map((p) => (p as { type: "text"; text: string }).text)
					.join("");
	return [{ type: "text", text }];
}

function contentToAssistant(message: Extract<AgentMessage, { role: "assistant" }>): { type: "text"; text: string }[] {
	const text = message.content
		.filter((p) => p.type === "text")
		.map((p) => (p as { type: "text"; text: string }).text)
		.join("");
	return text ? [{ type: "text", text }] : [];
}

function contentToTool(message: Extract<AgentMessage, { role: "toolResult" }>): { type: "text"; text: string }[] {
	return message.content
		.filter((p) => p.type === "text")
		.map((p) => (p as { type: "text"; text: string }).text)
		.map((text) => ({ type: "text" as const, text }));
}
