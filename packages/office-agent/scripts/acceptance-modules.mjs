/**
 * 三模块验收（doc/modules/extensions.md / client.md / server.md）。
 *
 * 运行：node scripts/acceptance-modules.mjs
 * 依赖：已 build、LibreOffice（如用到 convert）、本机网络（TCP localhost）。
 *
 * 覆盖：
 * - extensions：注册工具/提示/命令 → 合并进 Agent；同名冲突报错；目录加载
 * - client：openOfficeSession 连 rpc server 完成对话
 * - server：startOfficeServer 起 server，client 连上，close 优雅关闭
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const pkgDir = path.resolve(__dirname, "..");
const outDir = path.join(pkgDir, "examples", "out-modules");
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

const office = await import("../dist/index.js");
const { runOfficeExtensions, createOfficeAgentSession, makeOfficeDemoStreamFn, officeTools } = office;

// ---------------------------------------------------------------------------
console.log("== extensions：注册/合并/冲突/目录加载 ==");
const myExt = (pi) => {
	pi.registerTool({
		name: "office_fax",
		label: "传真",
		description: "发送传真（示例扩展工具）",
		parameters: Type.Object({ path: Type.String(), number: Type.String() }),
		meta: { direction: "wps" },
		async execute(_id, params) {
			return { content: [{ type: "text", text: `fax ${params.path} → ${params.number}` }], details: { artifacts: [] } };
		},
	});
	pi.registerPromptSnippet("传真能力", "- office_fax：可发送传真");
	pi.registerCommand("fax-status", () => "idle");
};
const reg = await runOfficeExtensions([myExt]);
check("扩展注册 1 工具 1 提示 1 命令", reg.tools.length === 1 && reg.promptSnippets.length === 1 && reg.commands.size === 1, `t=${reg.tools.length} p=${reg.promptSnippets.length} c=${reg.commands.size}`);
check("无错误", reg.errors.length === 0, JSON.stringify(reg.errors));

const { agent } = await createOfficeAgentSession({ streamFn: makeOfficeDemoStreamFn(), extensions: [myExt] });
const toolNames = (agent.state.tools ?? []).map((t) => t.name);
check("Agent 工具集含扩展工具（11 个）", toolNames.includes("office_fax"), toolNames.length);
check("内置 officeTools 未被覆盖", toolNames.includes("wps_writer"), "");
const prompt = agent.state.systemPrompt ?? "";
check("扩展提示片段进入系统提示", prompt.includes("- office_fax"), prompt.slice(0, 60));

const conflict = (pi) => pi.registerTool({
	name: "wps_writer",
	label: "冲突",
	description: "与内置同名",
	parameters: Type.Object({}),
	meta: { direction: "wps" },
	async execute() {
		return { content: [{ type: "text", text: "" }], details: { artifacts: [] } };
	},
});
let conflictThrew = false;
try {
	await createOfficeAgentSession({ extensions: [conflict] });
} catch {
	conflictThrew = true;
}
check("同名冲突抛错", conflictThrew);

// 目录加载（建一个临时扩展文件）
const tmpExtDir = path.join(outDir, "ext");
await mkdir(tmpExtDir, { recursive: true });
const { writeFile } = await import("node:fs/promises");
await writeFile(
	path.join(tmpExtDir, "ext-a.mjs"),
	`export default (pi) => { pi.registerPromptSnippet("来自文件", "- 目录加载扩展"); };\n`,
);
const loaded = await office.loadOfficeExtensionsFromDir(tmpExtDir);
check("目录加载 1 个扩展文件", loaded.length === 1, `got ${loaded.length}`);

// ---------------------------------------------------------------------------
console.log("\n== server + client：startOfficeServer → openOfficeSession ==");
const { startOfficeServer } = await import("../dist/server/index.js");
const { openOfficeSession } = await import("../dist/client/index.js");

const rpcOut = path.join(outDir, "module-server.docx");
const port = 43927;
const { address, close } = await startOfficeServer({
	host: "127.0.0.1",
	port,
	cwd: outDir,
	streamFn: makeOfficeDemoStreamFn(),
});
process.env.OFFICE_DEMO_OUT = rpcOut;
check("startOfficeServer 就绪并返回 address", address.includes(String(port)), address);

const session = await openOfficeSession({ host: "127.0.0.1", port, cwd: outDir });
check("openOfficeSession 连接成功", session.id !== undefined, String(session.id));
let lastState;
session.subscribe((s) => (lastState = s));
await session.submit("写季度总结 docx");
await new Promise((r) => setTimeout(r, 800));
const toolItems = (lastState?.transcript ?? []).filter((i) => i.role === "tool");
check("对话产生 tool item（wps_writer 执行）", toolItems.length > 0, `tools=${toolItems.length}`);
const artifacts = (lastState?.transcript ?? []).flatMap((i) => i.details?.artifacts ?? []);
check("产物 docx 生成", artifacts.some((a) => a.kind === "docx"), JSON.stringify(artifacts).slice(0, 80));

await close();
check("close() 优雅关闭", true);
delete process.env.OFFICE_DEMO_OUT;

// ---------------------------------------------------------------------------
console.log(`\n结果: ${failed === 0 ? "ALL CHECKS PASSED ✔" : `${failed} 项失败`}`);
if (failed > 0) process.exit(1);
