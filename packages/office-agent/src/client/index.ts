/**
 * office-agent 客户端封装（doc/modules/client.md）。
 *
 * 对外 SDK 形态：`import { openOfficeSession } from "@earendil-works/pi-office-agent/client"`。
 * 底层复用真实包：PiClient（pi-client）+ RemoteSession（pi-coding-agent/client）+
 * createTcpTransportFactory（office modes/tcp，Windows 可用 TCP 字节传输），
 * 只做装配封装，不重造协议。
 */
import { PiClient } from "@earendil-works/pi-client";
import {
	RemoteSession,
	type RemoteSessionOptions,
	type RemoteSessionState,
} from "@earendil-works/pi-coding-agent/client";
import type { ModelRef, ThinkingLevel } from "@earendil-works/pi-protocol";
import { createTcpTransportFactory } from "../modes/tcp.ts";

export type { RemoteSessionOptions, RemoteSessionState };
export { RemoteSession };
export { createTcpTransportFactory } from "../modes/tcp.ts";

/** office 客户端连接选项（对应 `office --mode rpc` 的 server 参数）。 */
export interface OfficeClientOptions {
	/** server 地址（默认 127.0.0.1） */
	host?: string;
	/** server 端口（必填） */
	port: number;
	/** 会话工作目录（RemoteSession.create 用） */
	cwd: string;
	model?: ModelRef;
	thinkingLevel?: ThinkingLevel;
	sessionOptions?: RemoteSessionOptions;
}

/** 创建连到 office rpc server 的 PiClient（TCP transport，Windows 可用）。 */
export function createOfficePiClient(options: Pick<OfficeClientOptions, "host" | "port">): PiClient {
	return new PiClient({
		transportFactory: createTcpTransportFactory({ host: options.host ?? "127.0.0.1", port: options.port }),
	});
}

/** 连接 office rpc server 并创建远程会话（office-gui / 外部消费者入口）。 */
export async function openOfficeSession(options: OfficeClientOptions): Promise<RemoteSession> {
	const client = createOfficePiClient(options);
	await client.connect();
	return RemoteSession.create(
		client,
		{ cwd: options.cwd, model: options.model, thinkingLevel: options.thinkingLevel },
		options.sessionOptions,
	);
}
