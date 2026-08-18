/**
 * office-agent 运行模式（phase-4 §2 入口结构 + subagent json 模式，镜像 coding-agent modes/index.ts）。
 */

export { type InteractiveOptions, runInteractive } from "./interactive.ts";
export { type JsonModeEvent, type JsonModeOptions, runJson, type SubagentUsage } from "./json.ts";
export { type PrintOptions, runPrint } from "./print.ts";
export { type RpcOptions, runRpc } from "./rpc.ts";
export { createTcpListener, createTcpTransportFactory, type TcpListenerOptions } from "./tcp.ts";
