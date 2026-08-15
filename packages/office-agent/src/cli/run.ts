#!/usr/bin/env node

import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createOfficeAgent } from "../core/office-agent.ts";

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		options: {
			demo: { type: "boolean", default: false },
			input: { type: "string" },
			title: { type: "string" },
			summary: { type: "string" },
			audience: { type: "string" },
			style: { type: "string" },
		},
		allowPositionals: true,
	});

	const agent = createOfficeAgent({ defaultTitle: values.title ?? "Office Agent Report" });

	if (values.demo) {
		const result = await agent.run({
			title: values.title ?? "Demo Office report",
			summary: values.summary ?? "This demo report shows the initial Office Agent workflow.",
			audience: values.audience ?? "internal team",
			style: values.style ?? "modern business",
			inputFiles: [resolve(process.cwd(), "README.md")],
		});

		console.log(
			JSON.stringify(
				{
					outputDir: result.outputDir,
					title: result.report.title,
					intro: result.emailDraft.subject,
					poster: result.posterBrief.prompt,
				},
				null,
				2,
			),
		);
		return;
	}

	const inputFiles = values.input
		? [resolve(values.input)]
		: positionals.length > 0
			? positionals.map((item) => resolve(item))
			: [];

	const result = await agent.run({
		inputFiles,
		title: values.title,
		summary: values.summary,
		audience: values.audience,
		style: values.style,
	});

	console.log(
		JSON.stringify(
			{
				outputDir: result.outputDir,
				reportTitle: result.report.title,
				summary: result.report.summary,
				emailSubject: result.emailDraft.subject,
				posterPrompt: result.posterBrief.prompt,
			},
			null,
			2,
		),
	);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Office Agent failed: ${message}`);
	process.exitCode = 1;
});
