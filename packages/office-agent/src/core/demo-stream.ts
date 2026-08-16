/**
 * 无 LLM 环境的演示流函数（phase-4 入口兜底）。
 *
 * 与 phase-2/3 验收同款模式：第一轮发 wps_writer 工具调用，第二轮收尾。
 * 用于 `office --mode print/rpc` 在没有配置模型时也能端到端演示
 * "对话 → 生成 docx" 闭环；有真实 model 时入口走 streamSimple。
 */

import type { StreamFunction } from "@earendil-works/pi-ai";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";

/** 生成一个"会调用 wps_writer 生成季度总结 docx"的演示流函数。 */
export function makeOfficeDemoStreamFn(): StreamFunction {
	let callCount = 0;
	return () => {
		callCount += 1;
		const stream = createAssistantMessageEventStream();
		queueMicrotask(() => {
			if (callCount === 1) {
				const msg = {
					role: "assistant",
					content: [
						{ type: "text", text: "好的，我来生成 Word 文档。" },
						{
							type: "toolCall",
							id: "call-office-1",
							name: "wps_writer",
							arguments: {
								title: "季度总结",
								sections: [{ heading: "概述", body: "本季度业务整体增长。这是一份由办公助手自动生成的文档。" }],
								outPath: process.env.OFFICE_DEMO_OUT ?? "demo-quarterly.docx",
							},
						},
					],
					api: "office-demo",
					provider: "office-demo",
					model: "demo",
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: "toolUse",
					timestamp: Date.now(),
				} as AssistantMessage;
				stream.push({ type: "start", partial: msg });
				stream.push({ type: "done", reason: "toolUse", message: msg });
			} else {
				const msg = {
					role: "assistant",
					content: [{ type: "text", text: "文档已生成完毕。" }],
					api: "office-demo",
					provider: "office-demo",
					model: "demo",
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: "stop",
					timestamp: Date.now(),
				} as AssistantMessage;
				stream.push({ type: "start", partial: msg });
				stream.push({ type: "done", reason: "stop", message: msg });
			}
		});
		return stream;
	};
}
