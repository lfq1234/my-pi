/**
 * rpc 模式（FR-4.4）：用 pi-protocol 起 RPC server，供 office-gui 经 RemoteSession 连。
 *
 * 实现收敛到 server/startOfficeServer（doc/modules/server.md）：
 * agent 由 createOfficeAgentSession 默认装配，service 复用 OfficeDemoServerService，
 * 协议完全走 pi-protocol；client 端用 client/openOfficeSession 直连。
 */
import type { StreamFunction } from "@earendil-works/pi-ai";
import type { OfficeInlineExtension } from "../extensions/index.ts";
import { startOfficeServer } from "../server/index.ts";

export interface RpcOptions {
	/** 流函数（无 LLM 环境传 makeOfficeDemoStreamFn 演示流） */
	streamFn?: StreamFunction;
	/** 内联扩展（doc/modules/extensions.md） */
	extensions?: OfficeInlineExtension[];
	/** 监听 host（默认 127.0.0.1） */
	host?: string;
	/** 监听端口 */
	port: number;
	/** 会话工作目录 */
	cwd?: string;
}

/** 运行 rpc 模式：起 server 常驻，SIGINT/SIGTERM 时优雅关闭。 */
export async function runRpc(options: RpcOptions): Promise<void> {
	const { address, close } = await startOfficeServer({
		host: options.host,
		port: options.port,
		cwd: options.cwd,
		streamFn: options.streamFn,
		extensions: options.extensions,
	});
	console.log(`office rpc server listening on ${address} (Ctrl+C to stop)`);

	await new Promise<void>((resolve) => {
		const stop = (): void => {
			void close().finally(resolve);
		};
		process.once("SIGINT", stop);
		process.once("SIGTERM", stop);
	});
}
