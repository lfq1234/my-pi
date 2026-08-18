/**
 * subagent 工具（doc/modules/subagent.md §2.3）：进程级多智能体委派。
 *
 * 镜像 coding-agent 官方 subagent 扩展示例：
 * - 每个子任务 spawn 独立 `office --mode json` 进程（隔离上下文窗口）
 * - 角色 system prompt 用 `--append-system-prompt <file>` 注入
 * - 三种模式：single（agent+task）/ parallel（tasks，≤8 任务 ≤4 并发）/ chain（{previous} 占位）
 * - stdout 解析 office json 模式事件（assistant_message/tool_call/tool_result_end/usage）
 */
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Static, Type } from "typebox";
import type { OfficeTool, OfficeToolDefinition } from "../core/tools/types.ts";
import { wrapOfficeToolDefinition } from "../core/tools/wrapper.ts";
import type { SubagentUsage } from "../modes/json.ts";
import { OFFICE_BUILTIN_AGENTS, type OfficeAgentDef } from "./agents.ts";

export type AgentScope = "user" | "project" | "both";

export interface SubagentResult {
	agent: string;
	agentSource: string;
	task: string;
	exitCode: number;
	messages: string[];
	stderr: string;
	usage: SubagentUsage;
	step?: number;
}

export interface SubagentDetails {
	mode: "single" | "parallel" | "chain";
	results: SubagentResult[];
}

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const PER_TASK_OUTPUT_CAP = 50 * 1024;

/** office CLI 可执行文件（dist/cli.js，相对本文件 dist/extensions/）。 */
function officeCliPath(): string {
	return fileURLToPath(new URL("../cli.js", import.meta.url));
}

/** 简单 frontmatter 解析（name/description/tools/model + 正文 system prompt）。 */
export function parseAgentMarkdown(
	content: string,
	filePath: string,
	source: "user" | "project",
): OfficeAgentDef | undefined {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return undefined;
	const front = match[1];
	const body = match[2].trim();
	const get = (key: string): string | undefined => front.match(new RegExp(`^${key}:(.+)$`, "m"))?.[1]?.trim();
	const name = get("name");
	if (!name) return undefined;
	const tools = get("tools");
	return {
		name,
		description: get("description") ?? "",
		tools: tools
			? tools
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			: undefined,
		model: get("model"),
		systemPrompt: body,
		source,
		filePath,
	};
}

/** 发现可用 agent：内置 + user 目录 + project 目录。 */
export async function discoverOfficeAgents(cwd: string, scope: AgentScope = "user"): Promise<OfficeAgentDef[]> {
	const agents = [...OFFICE_BUILTIN_AGENTS];
	const userDir = join(homedir(), ".office-agent", "agents");
	const projectDir = join(cwd, ".office-agent", "agents");

	const loadDir = async (dir: string, source: "user" | "project"): Promise<void> => {
		if (source === "user" && scope === "project") return;
		if (source === "project" && scope === "user") return;
		let entries: string[];
		try {
			entries = await readdir(dir);
		} catch {
			return;
		}
		for (const file of entries.filter((f) => f.endsWith(".md"))) {
			try {
				const content = await readFile(join(dir, file), "utf8");
				const def = parseAgentMarkdown(content, join(dir, file), source);
				if (def) agents.push(def);
			} catch {
				/* 单个坏文件不阻塞 */
			}
		}
	};

	await loadDir(userDir, "user");
	await loadDir(projectDir, "project");
	return agents;
}

export function getAgentByName(agents: OfficeAgentDef[], name: string): OfficeAgentDef | undefined {
	return agents.find((a) => a.name === name);
}

/** 运行一个子 agent 进程，返回结构化结果。 */
export async function runSubagentProcess(options: {
	task: string;
	agent: OfficeAgentDef;
	cwd: string;
	step?: number;
}): Promise<SubagentResult> {
	const { task, agent, cwd, step } = options;
	const result: SubagentResult = {
		agent: agent.name,
		agentSource: agent.source,
		task,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		step,
	};

	const args: string[] = ["--mode", "json"];
	if (agent.systemPrompt.trim()) {
		// 角色 system prompt 写入临时文件，用 --append-system-prompt 注入
		const tmpDir = await mkdtemp(join(tmpdir(), "office-subagent-"));
		const promptPath = join(tmpDir, `${agent.name}.prompt.md`);
		await writeFile(promptPath, agent.systemPrompt, "utf8");
		args.push("--append-system-prompt", promptPath);
	}
	args.push("--prompt", `Task: ${task}`);
	const cliPath = officeCliPath();

	const exitCode = await new Promise<number>((resolvePromise) => {
		const proc = spawn(process.execPath, [cliPath, ...args], {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let buffer = "";

		const processLine = (line: string): void => {
			if (!line.trim()) return;
			let event: { type?: string } & Record<string, unknown>;
			try {
				event = JSON.parse(line);
			} catch {
				return;
			}
			if (event.type === "assistant_message") {
				const content = (event.message as { content?: string })?.content ?? "";
				if (content) result.messages.push(content);
			} else if (event.type === "usage") {
				result.usage = event.usage as SubagentUsage;
			}
		};

		proc.stdout.on("data", (data: Buffer) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) processLine(line);
		});
		proc.stderr.on("data", (data: Buffer) => {
			result.stderr += data.toString();
		});
		proc.on("error", (error) => {
			result.stderr += String(error);
			resolvePromise(1);
		});
		proc.on("close", (code) => {
			if (buffer.trim()) processLine(buffer);
			resolvePromise(code ?? 0);
		});
	});

	result.exitCode = exitCode;
	// 输出上限保护
	const cap = PER_TASK_OUTPUT_CAP;
	const total = result.messages.join("").length;
	if (total > cap) {
		let acc = "";
		const kept: string[] = [];
		for (const m of result.messages) {
			if (acc.length + m.length > cap) break;
			acc += m;
			kept.push(m);
		}
		result.messages = kept;
	}
	return result;
}

// ---------------------------------------------------------------------------
// 工具定义
// ---------------------------------------------------------------------------

export const subagentParams = Type.Object({
	agent: Type.Optional(Type.String({ description: "single 模式：角色名" })),
	task: Type.Optional(Type.String({ description: "single 模式：任务" })),
	tasks: Type.Optional(
		Type.Array(Type.Object({ agent: Type.String(), task: Type.String() }), {
			description: "parallel 模式：并行任务（≤8 个）",
		}),
	),
	chain: Type.Optional(
		Type.Array(Type.Object({ agent: Type.String(), task: Type.String() }), {
			description: "chain 模式：顺序步骤，{previous} 占位符传上一步输出",
		}),
	),
	agentScope: Type.Optional(Type.Union([Type.Literal("user"), Type.Literal("project"), Type.Literal("both")])),
});

export type SubagentParams = Static<typeof subagentParams>;

export interface OfficeSubagentToolOptions {
	cwd?: string;
}

export function createOfficeSubagentToolDefinition(
	options: OfficeSubagentToolOptions = {},
): OfficeToolDefinition<typeof subagentParams, SubagentDetails> {
	const cwd = options.cwd ?? process.cwd();
	return {
		name: "subagent",
		label: "多智能体委派",
		description: [
			"把任务委派给独立子进程（隔离上下文）的专用 agent。",
			"模式：single（agent+task）/ parallel（tasks 数组）/ chain（顺序 + {previous} 占位）。",
			"内置角色：scout/planner/worker/reviewer；自定义角色放 ~/.office-agent/agents/*.md。",
		].join(" "),
		promptSnippet: "委派任务给子智能体",
		parameters: subagentParams,
		meta: { direction: "wps" },
		async execute(_toolCallId, params, _signal?) {
			const scope: AgentScope = params.agentScope ?? "user";
			const agents = await discoverOfficeAgents(cwd, scope);
			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);
			const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

			const makeDetails = (mode: "single" | "parallel" | "chain", results: SubagentResult[]): SubagentDetails => ({
				mode,
				results,
			});

			if (modeCount !== 1) {
				const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
				return {
					content: [
						{
							type: "text",
							text: `Invalid parameters. Provide exactly one mode.\nAvailable agents: ${available}`,
						},
					],
					details: makeDetails("single", []),
				};
			}

			const resolveAgent = (name: string, step?: number): SubagentResult | undefined => {
				const agent = getAgentByName(agents, name);
				if (!agent) {
					const available = agents.map((a) => a.name).join(", ") || "none";
					return {
						agent: name,
						agentSource: "unknown",
						task: "",
						exitCode: 1,
						messages: [],
						stderr: `Unknown agent: "${name}". Available agents: ${available}.`,
						usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
						step,
					};
				}
				return undefined;
			};

			if (hasSingle) {
				const bad = resolveAgent(params.agent!);
				if (bad) return { content: [{ type: "text", text: bad.stderr }], details: makeDetails("single", [bad]) };
				const agent = getAgentByName(agents, params.agent!)!;
				const result = await runSubagentProcess({ task: params.task!, agent, cwd });
				const text = result.messages.join("\n") || result.stderr || "(no output)";
				return { content: [{ type: "text", text }], details: makeDetails("single", [result]) };
			}

			if (hasTasks) {
				const tasks = params.tasks!.slice(0, MAX_PARALLEL_TASKS);
				const errors: SubagentResult[] = [];
				for (const t of tasks) {
					const bad = resolveAgent(t.agent);
					if (bad) errors.push(bad);
				}
				if (errors.length > 0) {
					return {
						content: [{ type: "text", text: errors.map((e) => e.stderr).join("\n") }],
						details: makeDetails("parallel", errors),
					};
				}
				// 并发执行（≤4）
				const results: SubagentResult[] = [];
				for (let i = 0; i < tasks.length; i += MAX_CONCURRENCY) {
					const batch = tasks.slice(i, i + MAX_CONCURRENCY);
					const batchResults = await Promise.all(
						batch.map((t) => runSubagentProcess({ task: t.task, agent: getAgentByName(agents, t.agent)!, cwd })),
					);
					results.push(...batchResults);
				}
				const text = results.map((r) => `[${r.agent}] ${r.messages.join("\n") || r.stderr}`).join("\n\n");
				return { content: [{ type: "text", text }], details: makeDetails("parallel", results) };
			}

			// chain：顺序执行，{previous} 占位替换上一步输出
			const steps = params.chain!;
			const results: SubagentResult[] = [];
			let previous = "";
			for (let i = 0; i < steps.length; i++) {
				const step = steps[i];
				const bad = resolveAgent(step.agent, i);
				if (bad) {
					results.push(bad);
					break;
				}
				const agent = getAgentByName(agents, step.agent)!;
				const task = step.task.replaceAll("{previous}", previous || "(上一步无输出)");
				const result = await runSubagentProcess({ task, agent, cwd, step: i });
				results.push(result);
				previous = result.messages.join("\n");
			}
			const text = results.map((r) => `[${r.agent}] ${r.messages.join("\n") || r.stderr}`).join("\n\n");
			return { content: [{ type: "text", text }], details: makeDetails("chain", results) };
		},
	};
}

export function createOfficeSubagentTool(
	options?: OfficeSubagentToolOptions,
): OfficeTool<typeof subagentParams, SubagentDetails> {
	return wrapOfficeToolDefinition(createOfficeSubagentToolDefinition(options));
}

/** 便捷扩展工厂：一条扩展注册 subagent 工具（createOfficeAgentSession({ extensions: [createOfficeSubagentExtension()] })）。 */
export function createOfficeSubagentExtension(options?: OfficeSubagentToolOptions): OfficeExtensionFactory {
	return (pi) => {
		pi.registerTool(createOfficeSubagentToolDefinition(options));
	};
}

export { OFFICE_BUILTIN_AGENTS } from "./agents.ts";

import type { OfficeExtensionFactory } from "./types.ts";
