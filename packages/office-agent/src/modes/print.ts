/**
 * print 模式（FR-4.3）：一次性跑完打印结果退出，用于批量 / CI 场景。
 *
 * 镜像 coding-agent 的 runPrintMode：prompt → 取最后一条 assistant 消息 →
 * 输出文本 → 返回退出码。会话由 createOfficeAgentSession 默认装配（工具 + 办公提示）。
 */
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { OfficeAgentSession } from "../core/agent-session.ts";

export interface PrintOptions {
	/** 一次性提示词（--prompt） */
	prompt: string;
}

/** 运行 print 模式，返回进程退出码（0 成功，1 出错）。 */
export async function runPrint(session: OfficeAgentSession, options: PrintOptions): Promise<number> {
	const { prompt } = options;
	if (!prompt) {
		console.error("Error: --mode print 需要 --prompt <prompt>");
		return 1;
	}

	try {
		await session.prompt(prompt);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`office print failed: ${message}`);
		return 1;
	}

	const messages = session.messages;
	const last = messages[messages.length - 1];
	if (last?.role === "assistant") {
		const assistantMsg = last as AssistantMessage;
		if (assistantMsg.stopReason === "error" || assistantMsg.stopReason === "aborted") {
			console.error(assistantMsg.errorMessage || `Request ${assistantMsg.stopReason}`);
			return 1;
		}
		for (const content of assistantMsg.content) {
			if (content.type === "text") console.log(content.text);
		}
	} else if (!last) {
		console.error("office print: 没有收到回复");
		return 1;
	}

	return 0;
}
