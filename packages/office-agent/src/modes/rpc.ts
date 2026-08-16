/**
 * rpc 模式（FR-4.4）：用 pi-protocol 起 RPC server，供 office-gui 经 RemoteSession 连。
 *
 * 链路与 phase-3 AC-3 同构：PiServer + office service + TCP listener。
 * service 复用 OfficeDemoServerService（内部用 createOfficeAgentSession 的
 * 默认装配 agent 驱动），协议完全走 pi-protocol，client 端用 coding-agent/client
 * 的 RemoteSession 即可直连（TCP transport 见 ./tcp.ts）。
 */
import type { Agent } from "@earendil-works/pi-agent-core";
import { PiServer } from "@earendil-works/pi-server";
import { OfficeDemoServerService } from "../gui/demo-server.ts";
import { createTcpListener } from "./tcp.ts";

export interface RpcOptions {
	/** 会话 agent（由 createOfficeAgentSession 默认装配，工具 + 办公提示） */
	agent: Agent;
	/** 监听 host（默认 127.0.0.1） */
	host?: string;
	/** 监听端口 */
	port: number;
	/** 会话工作目录 */
	cwd?: string;
}

/** 运行 rpc 模式：起 server 常驻，SIGINT/SIGTERM 时优雅关闭。 */
export async function runRpc(options: RpcOptions): Promise<void> {
	const host = options.host ?? "127.0.0.1";
	const service = new OfficeDemoServerService({ agent: options.agent });
	const listener = createTcpListener({ host, port: options.port });
	const server = new PiServer(service, { listeners: [listener], serverId: "office-rpc-server" });

	await server.start();
	const address = listener.address ?? `${host}:${options.port}`;
	console.log(`office rpc server listening on ${address} (Ctrl+C to stop)`);

	await new Promise<void>((resolve) => {
		const stop = (): void => {
			void server.close().finally(resolve);
		};
		process.once("SIGINT", stop);
		process.once("SIGTERM", stop);
	});
}
