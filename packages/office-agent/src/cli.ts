#!/usr/bin/env node

import { parseArgs } from "node:util";

const USAGE = `office-agent

Usage:
  office [--help] [--version]

This package is an empty Phase 0 skeleton built on the shared pi engine.
`;

export async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(USAGE);
		return;
	}

	if (values.version) {
		console.log("0.1.0");
		return;
	}

	console.log(USAGE);
}

const executedScriptPath = process.argv[1]?.replaceAll("\\", "/");
if (executedScriptPath?.endsWith("dist/cli.js")) {
	void main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`office-agent failed: ${message}`);
		process.exitCode = 1;
	});
}
