/**
 * office-agent 会话类（phase-2 §4：镜像 coding-agent 的 AgentSession，最小版）。
 *
 * 持有 pi-agent-core 的真实 Agent（已注入 officeTools），提供 prompt 转发与
 * transcript 只读访问。phase-4 在此基础上叠加 session-manager / settings 等。
 */
import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai/compat";

export interface OfficeAgentSessionOptions {
	cwd?: string;
	agentDir?: string;
	model?: Model<any>;
	agent?: Agent;
}

export class OfficeAgentSession {
	readonly cwd: string;
	readonly agentDir: string;
	readonly model?: Model<any>;
	readonly agent?: Agent;

	constructor(options: OfficeAgentSessionOptions = {}) {
		this.cwd = options.cwd ?? process.cwd();
		this.agentDir = options.agentDir ?? process.cwd();
		this.model = options.model;
		this.agent = options.agent;
	}

	/** 向 Agent 发送一条用户消息（复用 pi-agent-core 的 agent loop） */
	async prompt(message: string | AgentMessage | AgentMessage[]): Promise<void> {
		if (!this.agent) throw new Error("OfficeAgentSession has no agent; pass agent to createOfficeAgentSession.");
		if (typeof message === "string") {
			await this.agent.prompt(message);
		} else {
			await this.agent.prompt(message);
		}
	}

	/** 当前 transcript（只读快照） */
	get messages(): AgentMessage[] {
		return this.agent ? this.agent.state.messages.slice() : [];
	}
}
