import type { OfficeDocument, OfficeFileKind } from "../../core/types.ts";

export interface OfficeAgentRuntimeContext {
  agentName: string;
  workingDirectory: string;
  files: string[];
  audience?: string;
  style?: string;
  targetFormat?: "docx" | "xlsx" | "pptx" | "html" | "markdown";
}

export interface OfficeRuntimeToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export class OfficeAgentRuntime {
  readonly context: OfficeAgentRuntimeContext;

  constructor(context: OfficeAgentRuntimeContext) {
    this.context = context;
  }

  async readDocuments(): Promise<OfficeRuntimeToolResult<OfficeDocument[]>> {
    return { ok: true, data: [] };
  }

  async summarizeDocuments(): Promise<OfficeRuntimeToolResult<string>> {
    return { ok: true, data: "Office agent runtime initialized." };
  }

  async writeDocument(kind: OfficeFileKind, content: string): Promise<OfficeRuntimeToolResult<string>> {
    return { ok: true, data: `Prepared ${kind} output for ${this.context.agentName}.` };
  }
}
