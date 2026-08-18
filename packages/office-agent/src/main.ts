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
import { checkEnvironment, printEnvReport } from "./core/env-check.ts";
import { createOfficeAgentSession } from "./core/sdk.ts";
import { runInteractive, runJson, runPrint, runRpc } from "./modes/index.ts";

export const VERSION = "0.1.0";

export type Mode = "interactive" | "print" | "rpc" | "json";

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
	/** `office doctor`：环境自检并自动安装缺失依赖 */
	doctor: boolean;
	/** 追加系统提示文件路径（subagent 角色注入用，读文件内容追加到默认系统提示） */
	appendSystemPrompt?: string;
	help: boolean;
	version: boolean;
}

export function printHelp(): void {
	console.log(`office - 办公智能体 CLI

用法:
  office --mode <interactive|print|rpc|json> [选项]
  office --prompt "<问题>"          # 等价于 --mode print
  office                            # 默认 interactive
  office doctor                     # 环境自检，缺失依赖自动安装

选项:
  --mode <mode>      运行模式：interactive / print / rpc / json（JSON lines 输出，subagent 子进程入口）
  -p, --prompt <str> print 模式的一次性提示词
  --cwd <dir>        会话工作目录（默认当前目录）
  --host <host>      rpc 监听地址（默认 127.0.0.1）
  --port <port>      rpc 监听端口（默认 4317）
  -h, --help         显示帮助
  -v, --version      显示版本

示例:
  office --mode print --prompt "写季度总结"     # 端到端生成 .docx 并退出
  office --mode interactive                     # 进入 TUI 对话
  office --mode rpc --port 4317                 # 起 RPC server 供 office-gui 连接
  office --mode json --prompt "写季度总结"    # 一次性 + JSON lines 输出（subagent 用）`);
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
			appendSystemPrompt: { type: "string" },
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
		},
		allowPositionals: true,
		strict: false,
	});
	const modeValue = typeof values.mode === "string" ? values.mode : undefined;
	const isDoctor = positionals[0] === "doctor";
	const promptValue = isDoctor ? undefined : typeof values.prompt === "string" ? values.prompt : positionals[0];
	let mode: Mode;
	if (modeValue === "interactive" || modeValue === "print" || modeValue === "rpc" || modeValue === "json") {
		mode = modeValue;
	} else {
		mode = promptValue ? "print" : "interactive";
	}
	const port = typeof values.port === "string" && Number.isInteger(Number(values.port)) ? Number(values.port) : 4317;
	return {
		mode,
		doctor: isDoctor,
		prompt: promptValue,
		cwd: typeof values.cwd === "string" ? values.cwd : undefined,
		host: typeof values.host === "string" ? values.host : undefined,
		port,
		appendSystemPrompt: typeof values.appendSystemPrompt === "string" ? values.appendSystemPrompt : undefined,
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
	if (args.doctor) {
		await runDoctor();
		return;
	}

	const cwd = args.cwd ?? process.cwd();
	// 无 LLM 环境的演示兜底（fake 流会调用 wps_writer 真实生成 docx）；
	// 有真实模型时编程式传 model（默认走 streamSimple）。rpc 模式在 runRpc 内部自建 agent。
	// --append-system-prompt：subagent 角色注入（读文件，由 SDK 追加到系统提示）。
	const { readFile } = await import("node:fs/promises");
	let appendSystemPrompt: string | undefined;
	if (args.appendSystemPrompt) {
		try {
			appendSystemPrompt = await readFile(args.appendSystemPrompt, "utf8");
		} catch (error: unknown) {
			console.error(`Warning: 无法读取 --append-system-prompt 文件（${args.appendSystemPrompt}）`);
			void error;
		}
	}
	const { session } = await createOfficeAgentSession({
		cwd,
		appendSystemPrompt,
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
			await runRpc({ streamFn: makeOfficeDemoStreamFn(), host: args.host, port: args.port, cwd });
			break;
		case "json":
			process.exitCode = await runJson(session, { prompt: args.prompt ?? "" });
			break;
	}
}

/** `office doctor`：环境自检；缺失依赖（LibreOffice）自动安装。 */
export async function runDoctor(): Promise<void> {
	console.log("office 环境自检（缺失依赖将自动安装）…\n");
	const report = await checkEnvironment({ autoInstall: true });
	printEnvReport(report);
	process.exitCode = report.allOk ? 0 : 1;
}
