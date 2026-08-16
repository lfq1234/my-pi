#!/usr/bin/env node
/**
 * office-agent CLI 入口（phase-4 §2，镜像 coding-agent src/cli.ts）。
 *
 * 只是进程入口：调 main()。参数解析、模式分发都在 main.ts。
 */
import { main } from "./main.ts";

process.title = "office";

void main(process.argv.slice(2)).catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`office failed: ${message}`);
	process.exitCode = 1;
});
