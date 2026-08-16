/**
 * office-agent 独立启动器（doc/modules/server.md）。
 *
 * startOfficeServer：一行起一个 pi-protocol server（TCP 默认，unix 可选），
 * agent 来自 createOfficeAgentSession 的默认装配（officeTools + 办公提示 +
 * extensions 注入），service 复用 gui/demo-server 的 OfficeDemoServerService。
 * `office --mode rpc` 与编程式启动共用这条链路。
 */
import type { Agent } from "@earendil-works/pi-agent-core";
import type { StreamFunction } from "@earendil-works/pi-ai";
import type { Model } from "@earendil-works/pi-ai/compat";
import { PiServer } from "@earendil-works/pi-server";
import { createUnixListener } from "@earendil-works/pi-server/unix";
import { createOfficeAgentSession } from "../core/sdk.ts";
import type { OfficeInlineExtension } from "../extensions/index.ts";
import { OfficeDemoServerService } from "../gui/demo-server.ts";
import { createTcpListener } from "../modes/tcp.ts";

export interface OfficeServerOptions {
	/** TCP 监听地址（默认 127.0.0.1） */
	host?: string;
	/** TCP 监听端口（必填） */
	port: number;
	/** transport 类型：tcp（默认）/ unix（仅非 Windows） */
	transport?: "tcp" | "unix";
	/** transport="unix" 时的 socket 路径 */
	unixPath?: string;
	/** 会话工作目录 */
	cwd?: string;
	/** 可选真实模型（缺省无 model，配合 streamFn 演示流） */
	model?: Model<any>;
	/** 流函数（createOfficeAgentSession 注入；无 LLM 环境可传 makeOfficeDemoStreamFn） */
	streamFn?: StreamFunction;
	/** 内联扩展（doc/modules/extensions.md） */
	extensions?: OfficeInlineExtension[];
	/** server 就绪回调（address 已确定时触发） */
	onReady?: (address: string) => void;
}

/** 启动 office pi-protocol server，返回可关闭句柄。 */
export async function startOfficeServer(options: OfficeServerOptions): Promise<{
	server: PiServer;
	service: OfficeDemoServerService;
	agent?: Agent;
	address: string;
	close(): Promise<void>;
}> {
	// 默认装配：createOfficeAgentSession 注入 officeTools + 办公提示 + extensions
	const { agent } = await createOfficeAgentSession({
		cwd: options.cwd,
		model: options.model,
		streamFn: options.streamFn,
		extensions: options.extensions,
	});
	const service = new OfficeDemoServerService({ agent });

	let listener: ReturnType<typeof createTcpListener> | ReturnType<typeof createUnixListener>;
	if (options.transport === "unix" && process.platform !== "win32") {
		listener = createUnixListener({ path: options.unixPath ?? "/tmp/office-agent.sock" });
	} else {
		listener = createTcpListener({ host: options.host ?? "127.0.0.1", port: options.port });
	}

	const server = new PiServer(service, { listeners: [listener], serverId: "office-server" });
	await server.start();
	const address = listener.address ?? `${options.host ?? "127.0.0.1"}:${options.port}`;
	options.onReady?.(address);
	return { server, service, agent, address, close: () => server.close() };
}
