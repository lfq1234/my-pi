/**
 * interactive 模式（FR-4.2）：默认 TUI（pi-tui），可对话并调用办公工具。
 *
 * 最小装配：TuiMainScreen + Container（对话历史）+ Input（提交/退出），
 * 引擎复用 pi-agent-core 的 Agent，工具由 createOfficeAgentSession 默认注入。
 * 支持注入虚拟 Terminal（测试/嵌入场景），缺省用 ProcessTerminal。
 */
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Container, Input, ProcessTerminal, type Terminal, Text, TuiMainScreen } from "@earendil-works/pi-tui";
import type { OfficeAgentSession } from "../core/agent-session.ts";

export interface InteractiveOptions {
	/** 测试/嵌入场景可注入虚拟终端，缺省用 ProcessTerminal */
	terminal?: Terminal;
}

/** 运行 interactive 模式（TUI 常驻，Escape 退出）。 */
export async function runInteractive(session: OfficeAgentSession, options: InteractiveOptions = {}): Promise<number> {
	const terminal = options.terminal ?? new ProcessTerminal();
	const tui = new TuiMainScreen(terminal, false);
	const root = new Container();
	const chat = new Container();
	const input = new Input();

	let resolveExit!: (code: number) => void;
	const exited = new Promise<number>((resolve) => {
		resolveExit = resolve;
	});

	const append = (text: string): void => {
		chat.addChild(new Text(text, 0, 0));
		tui.requestRender();
	};

	input.onSubmit = (value: string) => {
		const text = value.trim();
		if (!text) return;
		void (async () => {
			input.setValue("");
			append(`> ${text}`);
			try {
				await session.prompt(text);
				const messages = session.messages;
				const last = messages[messages.length - 1];
				if (last?.role === "assistant") {
					const assistantMsg = last as AssistantMessage;
					for (const content of assistantMsg.content) {
						if (content.type === "text") append(content.text);
					}
				}
			} catch (error: unknown) {
				append(`[error] ${error instanceof Error ? error.message : String(error)}`);
			}
			tui.requestRender();
		})();
	};

	input.onEscape = () => {
		tui.stop();
		resolveExit(0);
	};

	root.addChild(chat);
	root.addChild(input);
	tui.addChild(root);
	tui.setFocus(input);
	tui.start();

	// TUI 常驻；Escape 触发 onEscape → stop + resolve
	return exited;
}
