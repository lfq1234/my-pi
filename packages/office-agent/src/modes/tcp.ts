/**
 * TCP 字节传输（phase-4 rpc 模式）。
 *
 * pi-server 官方只有 Unix-domain socket listener，而 client 端 unix transport
 * 明确不支持 Windows。为了 `office --mode rpc` 在 Windows 上也能被
 * office-gui 用真实 RemoteSession 连上，这里提供 TCP 版的
 * createTcpListener（PiServer 侧）与 createTcpTransportFactory（PiClient 侧），
 * 协议仍是 pi-protocol，只是底层字节流走 TCP。
 */
import { createConnection, createServer, type Server, type Socket } from "node:net";
import type { ByteTransport, ByteTransportFactory, ByteTransportHandlers } from "@earendil-works/pi-client";
import type { PiServerListener } from "@earendil-works/pi-server";
import type {
	ByteConnection,
	ByteConnectionAcceptor,
	ByteConnectionHandler,
} from "@earendil-works/pi-server/connection";

export interface TcpListenerOptions {
	host?: string;
	port: number;
}

/** TCP 连接适配为 pi-server 的 ByteConnection（简化版：无背压限流）。 */
class TcpByteConnection implements ByteConnection {
	closed = false;
	private readonly socket: Socket;

	constructor(socket: Socket) {
		this.socket = socket;
	}

	send(chunk: Uint8Array): Promise<void> {
		if (this.closed) return Promise.reject(new Error("TCP connection is closed"));
		return new Promise<void>((resolve, reject) => {
			this.socket.write(Buffer.from(chunk), (error) => {
				if (error) reject(error);
				else resolve();
			});
		});
	}

	close(): Promise<void> {
		this.closed = true;
		return new Promise<void>((resolve) => {
			this.socket.end(() => resolve());
		});
	}
}

/** PiServer 侧 TCP listener（镜像 pi-server 的 unix listener，但用 net.Server 监听 TCP 端口）。 */
export function createTcpListener(options: TcpListenerOptions): PiServerListener {
	const host = options.host ?? "127.0.0.1";
	let server: Server | undefined;
	let accept: ByteConnectionAcceptor | undefined;
	let boundPort: number | undefined;

	return {
		get address(): string | undefined {
			return boundPort !== undefined ? `${host}:${boundPort}` : undefined;
		},
		async start(acceptor: ByteConnectionAcceptor): Promise<void> {
			if (server) throw new Error("TCP listener is already started");
			accept = acceptor;
			const srv = createServer((socket) => {
				const connection = new TcpByteConnection(socket);
				const handler: ByteConnectionHandler = accept!(connection);
				socket.on("data", (chunk) => {
					handler.onData(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
				});
				socket.on("error", (error) => handler.onError(error));
				socket.once("close", () => handler.onClose());
			});
			server = srv;
			await new Promise<void>((resolve, reject) => {
				srv.once("error", reject);
				srv.listen(options.port, host, () => {
					srv.off("error", reject);
					const addr = srv.address();
					boundPort = typeof addr === "object" && addr !== null ? addr.port : options.port;
					resolve();
				});
			});
		},
		async close(): Promise<void> {
			const srv = server;
			server = undefined;
			accept = undefined;
			if (!srv) return;
			await new Promise<void>((resolve) => {
				srv.close(() => resolve());
			});
		},
	};
}

/** PiClient 侧 TCP transport factory（镜像 client/unix.ts，但走 TCP 端口）。 */
export function createTcpTransportFactory(options: TcpListenerOptions): ByteTransportFactory {
	const host = options.host ?? "127.0.0.1";
	return (handlers: ByteTransportHandlers): Promise<ByteTransport> =>
		new Promise<ByteTransport>((resolve, reject) => {
			const socket = createConnection({ host, port: options.port });
			let connected = false;
			let terminal = false;

			const close = (): void => {
				if (terminal) return;
				terminal = true;
				socket.destroy();
				if (connected) handlers.onClose();
				else reject(new Error("TCP transport closed before connecting"));
			};

			socket.once("connect", () => {
				if (terminal) return;
				connected = true;
				resolve({
					send: (chunk: Uint8Array) =>
						new Promise<void>((res, rej) => {
							if (terminal) return rej(new Error("TCP transport is closed"));
							socket.write(Buffer.from(chunk), (error) => (error ? rej(error) : res()));
						}),
					close: () => {
						if (terminal) return;
						terminal = true;
						socket.destroy();
						handlers.onClose();
					},
				});
			});
			socket.on("data", (chunk) => {
				if (!terminal) handlers.onData(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
			});
			socket.once("end", close);
			socket.once("close", close);
			socket.once("error", (error) => {
				if (terminal) return;
				if (connected) handlers.onError(error);
				else reject(error);
			});
		});
}
