/**
 * json 模式（doc/modules/subagent.md §2.2）：一次性跑 `--prompt`，stdout 输出 JSON lines。
 *
 * 子进程调用入口（subagent 工具 spawn 它）：`office --mode json --prompt "<task>"`。
 * 事件行与 coding-agent `--mode json` 对齐：assistant_message / tool_call /
 * tool_result_end / usage；无 LLM 环境用演示流（与 print 模式一致）。
 */
import type { AgentMessage, AgentToolCall } from "@earendil-works/pi-agent-core";
import type { OfficeAgentSession } from "../core/agent-session.ts";

export interface JsonModeOptions {
	/** 一次性提示词（--prompt） */
	prompt: string;
}

export interface SubagentUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

/** role="toolResult" 的消息（toolResult 是独立角色，不在 assistant.content 里） */
type ToolResultMessage = Extract<AgentMessage, { role: "toolResult" }>;

export type JsonModeEvent =
	| { type: "assistant_message"; message: { role: "assistant"; content: string } }
	| { type: "tool_call"; message: AgentToolCall }
	| { type: "tool_result_end"; message: ToolResultMessage }
	| { type: "usage"; usage: SubagentUsage };

/** 输出一行 JSON 事件。 */
export function emitJsonEvent(event: JsonModeEvent): void {
	process.stdout.write(`${JSON.stringify(event)}\n`);
}

/** 运行 json 模式：跑完 prompt 后按序输出消息事件 + usage。返回退出码。 */
export async function runJson(session: OfficeAgentSession, options: JsonModeOptions): Promise<number> {
	const { prompt } = options;
	if (!prompt) {
		console.error("Error: --mode json 需要 --prompt <prompt>");
		return 1;
	}

	try {
		await session.prompt(prompt);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`office json failed: ${message}`);
		return 1;
	}

	// 按序输出消息事件：
	// - assistant 消息 content：text → assistant_message，toolCall → tool_call
	// - role="toolResult" 的独立消息 → tool_result_end
	const messages: AgentMessage[] = session.messages;
	for (const msg of messages) {
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "toolCall") {
					emitJsonEvent({ type: "tool_call", message: part });
				} else if (part.type === "text") {
					emitJsonEvent({ type: "assistant_message", message: { role: "assistant", content: part.text } });
				}
			}
		} else if (msg.role === "toolResult") {
			emitJsonEvent({ type: "tool_result_end", message: msg });
		}
	}

	// usage 汇总（演示流无真实计费；接入真实模型后有值）
	emitJsonEvent({
		type: "usage",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: messages.length },
	});
	return 0;
}
