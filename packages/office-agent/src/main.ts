/**
 * main 入口（phase-4 §2：镜像 coding-agent src/main.ts 的简化版）。
 *
 * 只负责"解析参数 → createOfficeAgentSession → 按模式分发"，
 * 不硬编码办公工具/提示（FR-4.5 / AC-4.4）——它们由 core/sdk.ts 默认装配。
 * 无 LLM 环境用演示流兜底（makeOfficeDemoStreamFn），有真实模型走编程式
 * createOfficeAgentSession({ model })（phase-6 完善模型解析）。
 */
import { parseArgs as nodeParseArgs } from "node:util";
import { makeOfficeDemoStreamFn } from "./core/demo-stream.ts";
import { createOfficeAgentSession } from "./core/sdk.ts";
import { runInteractive, runPrint, runRpc } from "./modes/index.ts";

export const VERSION = "0.1.0";

export type Mode = "interactive" | "print" | "rpc";

export interface Args {
	mode: Mode;
	/** print 模式一次性提示词（--prompt 或位置参数） */
	prompt?: string;
	/** 会话工作目录（--cwd，默认当前目录） */
	cwd?: string;
	/** rpc 监听 host（默认 127.0.0.1） */
	host?: string;
	/** rpc 监听端口（默认 4317） */
	port: number;
	help: boolean;
	version: boolean;
}

export function printHelp(): void {
	console.log(`office - 办公智能体 CLI

用法:
  office --mode <interactive|print|rpc> [选项]
  office --prompt "<问题>"          # 等价于 --mode print
  office                            # 默认 interactive

选项:
  --mode <mode>      运行模式：interactive / print / rpc
  -p, --prompt <str> print 模式的一次性提示词
  --cwd <dir>        会话工作目录（默认当前目录）
  --host <host>      rpc 监听地址（默认 127.0.0.1）
  --port <port>      rpc 监听端口（默认 4317）
  -h, --help         显示帮助
  -v, --version      显示版本

示例:
  office --mode print --prompt "写季度总结"     # 端到端生成 .docx 并退出
  office --mode interactive                     # 进入 TUI 对话
  office --mode rpc --port 4317                 # 起 RPC server 供 office-gui 连接`);
}

/** 解析命令行参数（node:util，镜像 coding-agent 的 cli/args 简化版）。 */
export function parseArgs(argv: string[]): Args {
	const { values, positionals } = nodeParseArgs({
		args: argv,
		options: {
			mode: { type: "string" },
			prompt: { type: "string", short: "p" },
			cwd: { type: "string" },
			host: { type: "string" },
			port: { type: "string" },
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
		},
		allowPositionals: true,
		strict: false,
	});
	const modeValue = typeof values.mode === "string" ? values.mode : undefined;
	const promptValue = typeof values.prompt === "string" ? values.prompt : positionals[0];
	let mode: Mode;
	if (modeValue === "interactive" || modeValue === "print" || modeValue === "rpc") {
		mode = modeValue;
	} else {
		mode = promptValue ? "print" : "interactive";
	}
	const port = typeof values.port === "string" && Number.isInteger(Number(values.port)) ? Number(values.port) : 4317;
	return {
		mode,
		prompt: promptValue,
		cwd: typeof values.cwd === "string" ? values.cwd : undefined,
		host: typeof values.host === "string" ? values.host : undefined,
		port,
		help: values.help === true,
		version: values.version === true,
	};
}

export async function main(rawArgs: string[]): Promise<void> {
	const args = parseArgs(rawArgs);
	if (args.help) {
		printHelp();
		return;
	}
	if (args.version) {
		console.log(VERSION);
		return;
	}

	const cwd = args.cwd ?? process.cwd();
	const { session, agent } = await createOfficeAgentSession({
		cwd,
		// 无 LLM 环境的演示兜底（fake 流会调用 wps_writer 真实生成 docx）；
		// 有真实模型时编程式传 model（默认走 streamSimple）
		streamFn: makeOfficeDemoStreamFn(),
	});

	switch (args.mode) {
		case "interactive":
			await runInteractive(session);
			break;
		case "print":
			process.exitCode = await runPrint(session, { prompt: args.prompt ?? "" });
			break;
		case "rpc":
			if (!agent) {
				console.error("Error: rpc 模式需要 agent");
				process.exitCode = 1;
				break;
			}
			await runRpc({ agent, host: args.host, port: args.port, cwd });
			break;
	}
}
