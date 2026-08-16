/**
 * phase-4 验收：office 入口三模式（interactive / print / rpc）。
 *
 * AC-4.1 print 端到端产出 docx 并退出（spawn 子进程）
 * AC-4.2 interactive 进入 TUI（注入虚拟终端，模拟输入对话 + Escape 退出）
 * AC-4.3 rpc 起 TCP server，真实 PiClient + RemoteSession 连上，对话生成 docx
 * AC-4.4 入口不硬编码办公工具/提示（文本扫描 cli/main/modes）
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PiClient } from "@earendil-works/pi-client";
import { RemoteSession } from "@earendil-works/pi-coding-agent/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, "..");
const outDir = path.join(pkgDir, "examples", "out-phase4");
await mkdir(outDir, { recursive: true });

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
	if (cond) {
		passed += 1;
		console.log(`  ✅ ${name}`);
	} else {
		failed += 1;
		console.log(`  ❌ ${name} ${extra}`);
	}
}

// ---------------------------------------------------------------------------
console.log("== AC-4.4 入口不硬编码办公工具/提示 ==");
const entryFiles = [
	"src/cli.ts",
	"src/main.ts",
	"src/modes/index.ts",
	"src/modes/print.ts",
	"src/modes/interactive.ts",
	"src/modes/rpc.ts",
	"src/modes/tcp.ts",
];
const hardcoded = [];
for (const f of entryFiles) {
	const content = await readFile(path.join(pkgDir, f), "utf8");
	if (content.includes("officeTools") || content.includes("OFFICE_SYSTEM_PROMPT")) hardcoded.push(f);
}
check("AC-4.4 入口文件无 officeTools/OFFICE_SYSTEM_PROMPT 引用", hardcoded.length === 0, hardcoded.join(","));

// ---------------------------------------------------------------------------
console.log("\n== AC-4.1 print 模式端到端 ==");
const printOut = path.join(outDir, "print-quarterly.docx");
const child = spawn(process.execPath, ["dist/cli.js", "--mode", "print", "--prompt", "写季度总结"], {
	cwd: pkgDir,
	env: { ...process.env, OFFICE_DEMO_OUT: printOut },
});
let childOut = "";
child.stdout.on("data", (d) => (childOut += d));
child.stderr.on("data", (d) => (childOut += d));
const printExit = await new Promise((resolve) => child.on("exit", (code) => resolve(code)));
check("AC-4.1 print 退出码 0", printExit === 0, `exit=${printExit}`);
check("AC-4.1 stdout 含收尾文本", childOut.includes("文档已生成完毕"), JSON.stringify(childOut.slice(0, 120)));
check("AC-4.1 .docx 已生成", existsSync(printOut), printOut);

// ---------------------------------------------------------------------------
console.log("\n== AC-4.2 interactive TUI（虚拟终端） ==");
const { runInteractive } = await import(pathToFileURL(path.join(pkgDir, "dist/modes/interactive.js")).href);
const { createOfficeAgentSession } = await import(pathToFileURL(path.join(pkgDir, "dist/core/sdk.js")).href);
const { makeOfficeDemoStreamFn } = await import(pathToFileURL(path.join(pkgDir, "dist/core/demo-stream.js")).href);

const tuiOut = path.join(outDir, "tui-quarterly.docx");
const fakeTerm = {
	columns: 80,
	rows: 24,
	kittyProtocolActive: false,
	onInput: null,
	writes: [],
	start(cb) {
		this.onInput = cb;
	},
	stop() {
		this.stopped = true;
	},
	drainInput() {
		return Promise.resolve();
	},
	write(data) {
		this.writes.push(data);
	},
	moveBy() {},
	hideCursor() {},
	showCursor() {},
};
const term = new Proxy(fakeTerm, {
	get(target, prop) {
		return prop in target ? target[prop] : () => {};
	},
});

process.env.OFFICE_DEMO_OUT = tuiOut;
const { session } = await createOfficeAgentSession({ streamFn: makeOfficeDemoStreamFn() });
const interactivePromise = runInteractive(session, { terminal: term });
await new Promise((r) => setTimeout(r, 400));
check("AC-4.2 TUI 启动（terminal.start 被调）", term.onInput !== null);
term.onInput("写季度总结"); // 先发字符（无控制字符 → 插入）
term.onInput("\n"); // 再发回车（单独触发 submit）
await new Promise((r) => setTimeout(r, 1000));
check("AC-4.2 对话驱动生成 .docx", existsSync(tuiOut), tuiOut);
term.onInput("\x1b");
const tuiExit = await Promise.race([
	interactivePromise,
	new Promise((r) => setTimeout(() => r(-1), 3000)),
]);
check("AC-4.2 Escape 退出返回 0", tuiExit === 0, `exit=${tuiExit}`);
delete process.env.OFFICE_DEMO_OUT;

// ---------------------------------------------------------------------------
console.log("\n== AC-4.3 rpc 模式 + 真实 RemoteSession ==");
const { createTcpTransportFactory } = await import(pathToFileURL(path.join(pkgDir, "dist/modes/tcp.js")).href);

const rpcOut = path.join(outDir, "rpc-quarterly.docx");
const rpcPort = 43917;

async function portFree(port) {
	return new Promise((resolve) => {
		const srv = net.createServer();
		srv.once("error", () => resolve(false));
		srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
	});
}
async function waitForPort(port, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const ok = await new Promise((resolve) => {
			const socket = net.createConnection({ host: "127.0.0.1", port });
			socket.once("connect", () => {
				socket.destroy();
				resolve(true);
			});
			socket.once("error", () => resolve(false));
		});
		if (ok) return true;
		await new Promise((r) => setTimeout(r, 150));
	}
	return false;
}

if (!(await portFree(rpcPort))) {
	check("AC-4.3 测试端口可复用", false, `port ${rpcPort} busy`);
} else {
	const rpc = spawn(process.execPath, ["dist/cli.js", "--mode", "rpc", "--port", String(rpcPort)], {
		cwd: pkgDir,
		env: { ...process.env, OFFICE_DEMO_OUT: rpcOut },
	});
	let rpcLog = "";
	rpc.stdout.on("data", (d) => (rpcLog += d));
	rpc.stderr.on("data", (d) => (rpcLog += d));

	const listening = await waitForPort(rpcPort, 8000);
	check("AC-4.3 rpc server 已监听端口", listening, rpcLog.slice(0, 200));

	if (listening) {
		const client = new PiClient({
			transportFactory: createTcpTransportFactory({ host: "127.0.0.1", port: rpcPort }),
		});
		try {
			await client.connect();
			check("AC-4.3 PiClient 经 TCP 连接成功", client.connected);

			const session = await RemoteSession.create(client, { cwd: outDir });
			check("AC-4.3 RemoteSession.create 成功", session.id !== undefined, String(session.id));

			let lastState;
			session.subscribe((state) => {
				lastState = state;
			});
			await session.submit("帮我写一份季度总结 docx");
			await new Promise((r) => setTimeout(r, 800));

			const transcript = lastState?.transcript ?? [];
			const toolItems = transcript.filter((i) => i.role === "tool");
			check("AC-4.3 对话后 transcript 有 tool item", toolItems.length > 0, `tools=${toolItems.length}`);
			const artifacts = transcript.flatMap((i) => i.details?.artifacts ?? []);
			check("AC-4.3 提取到 docx 产物", artifacts.length === 1 && artifacts[0]?.kind === "docx", JSON.stringify(artifacts));
			check("AC-4.3 docx 真实落盘", artifacts[0]?.path ? existsSync(artifacts[0].path) : false, artifacts[0]?.path);
		} catch (error) {
			check("AC-4.3 连接/对话", false, error instanceof Error ? error.message : String(error));
		} finally {
			try {
				await client.close?.();
			} catch {
				/* ignore */
			}
		}
	}

	// 关闭 rpc server
	rpc.kill("SIGINT");
	await new Promise((r) => setTimeout(r, 300));
	if (!rpc.killed) rpc.kill("SIGKILL");
}

// ---------------------------------------------------------------------------
console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
