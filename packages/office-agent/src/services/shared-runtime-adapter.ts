import type { OfficeAgentRuntimeContext } from "../runtime/office-runtime.ts";

export interface SharedRuntimeAdapterOptions {
  workspaceRoot: string;
  agentName: string;
}

export function createSharedRuntimeAdapter(options: SharedRuntimeAdapterOptions) {
  const context: OfficeAgentRuntimeContext = {
    agentName: options.agentName,
    workingDirectory: options.workspaceRoot,
    files: [],
    audience: "internal team",
    style: "modern business",
  };

  return {
    context,
    ready: true,
    provider: "shared-runtime-adapter",
    supports: ["read", "write", "summary", "report", "office-tools"],
  };
}
