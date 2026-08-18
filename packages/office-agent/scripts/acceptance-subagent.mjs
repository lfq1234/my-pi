/**
 * 多智能体（subagent）验收（doc/modules/subagent.md §4，AC-SUB-1~6）。
 *
 * 运行：node scripts/acceptance-subagent.mjs
 * 依赖：已 build、LibreOffice 可用。
 * 产物输出到 examples/out-subagent/。
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const pkgDir = join(__dirname, "..");
const outDir = join(pkgDir, "examples", "out-subagent");
await mkdir(outDir, { recursive: true });

let failed = 0;
function check(name, cond, extra = "") {
	if (cond) {
		console.log(`  ✅ ${name}`);
	} else {
		failed += 1;
		console.log(`  ❌ ${name} ${extra}`);
	}
}
async function exists(p) {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}

const office = await import("../dist/index.js");
const sub = await import("../dist/extensions/office-subagent.js");

// ---------------------------------------------------------------------------
console.log("== AC-SUB-1 office --mode json（子进程入口） ==");
const jsonOut = join(outDir, "sub-json.docx");
const child = spawn(process.execPath, ["dist/cli.js", "--mode", "json", "--prompt", "写季度总结"], {
	cwd: pkgDir,
	env: { ...process.env, OFFICE_DEMO_OUT: jsonOut },
});
let stdout = "";
let stderr = "";
child.stdout.on("data", (d) => (stdout += d));
child.stderr.on("data", (d) => (stderr += d));
const exit = await new Promise((resolve) => child.on("exit", (code) => resolve(code)));
check("AC-SUB-1 退出码 0", exit === 0, `exit=${exit}`);
const lines = stdout.split("\n").filter((l) => l.trim());
let allJson = true;
for (const l of lines) {
	try {
		JSON.parse(l);
	} catch {
		allJson = false;
	}
}
check("AC-SUB-1 每行是合法 JSON", allJson && lines.length >= 4, `lines=${lines.length}`);
const types = lines.map((l) => JSON.parse(l).type);
check("AC-SUB-1 事件含 assistant/tool/usage", types.includes("assistant_message") && types.includes("tool_call") && types.includes("usage"), types.join(","));
check("AC-SUB-1 子进程真实生成 docx", await exists(jsonOut), jsonOut);

// ---------------------------------------------------------------------------
console.log("\n== AC-SUB-5 角色发现 ==");
const agents = await sub.discoverOfficeAgents(outDir, "user");
check("AC-SUB-5 内置 4 角色", ["scout", "planner", "worker", "reviewer"].every((n) => agents.some((a) => a.name === n)), agents.map((a) => a.name).join(","));
// 外部 user 目录 md
const userAgentsDir = join(outDir, ".office-agent", "agents");
await mkdir(userAgentsDir, { recursive: true });
await writeFile(
	join(userAgentsDir, "custom.md"),
	"---\nname: custom-agent\ndescription: 自定义角色\n---\n你是自定义角色。",
);
const agents2 = await sub.discoverOfficeAgents(outDir, "both");
check("AC-SUB-5 project 目录 md 可发现（both scope）", agents2.some((a) => a.name === "custom-agent" && a.source === "project"));
const agentsUser = await sub.discoverOfficeAgents(outDir, "user");
check("AC-SUB-5 user scope 不含 project 角色", !agentsUser.some((a) => a.name === "custom-agent"));

// ---------------------------------------------------------------------------
console.log("\n== AC-SUB-2/3/4 subagent 工具三种模式 ==");
const tool = sub.createOfficeSubagentTool({ cwd: outDir });

// single
const r1 = await tool.execute("c1", { agent: "worker", task: "写季度总结 docx" });
check("AC-SUB-2 single 模式结果非空", r1.details.results.length === 1 && r1.details.results[0].exitCode === 0 && r1.details.results[0].messages.length > 0, JSON.stringify(r1.details.results[0]?.stderr).slice(0, 80));

// parallel
const r2 = await tool.execute("c2", {
	tasks: [
		{ agent: "worker", task: "写季度总结 docx" },
		{ agent: "planner", task: "规划海报结构" },
	],
});
check("AC-SUB-3 parallel 两任务完成", r2.details.mode === "parallel" && r2.details.results.length === 2 && r2.details.results.every((r) => r.exitCode === 0));

// chain
const r3 = await tool.execute("c3", {
	chain: [
		{ agent: "planner", task: "规划季度总结的结构" },
		{ agent: "worker", task: "按 {previous} 生成 docx" },
	],
});
check("AC-SUB-4 chain 两段完成", r3.details.mode === "chain" && r3.details.results.length === 2 && r3.details.results.every((r) => r.exitCode === 0), JSON.stringify(r3.details.results.map((r) => r.exitCode)));
check("AC-SUB-4 {previous} 占位替换", !r3.details.results[1].task.includes("{previous}"), r3.details.results[1].task.slice(0, 60));

// 非法参数（多模式）→ 报错
const rBad = await tool.execute("c4", { agent: "worker", task: "x", tasks: [{ agent: "worker", task: "y" }] });
check("多模式同时指定报错", rBad.content[0].text.includes("exactly one mode"), rBad.content[0].text.slice(0, 60));

// ---------------------------------------------------------------------------
console.log(`\n结果: ${failed === 0 ? "ALL CHECKS PASSED ✔" : `${failed} 项失败`}`);
if (failed > 0) process.exit(1);
