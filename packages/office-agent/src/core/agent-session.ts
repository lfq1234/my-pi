export interface AgentLike {
  readonly id?: string;
}

export interface OfficeAgentSessionOptions {
  cwd?: string;
  agentDir?: string;
  model?: unknown;
}

export class OfficeAgentSession {
  readonly cwd: string;
  readonly agentDir: string;
  readonly model?: unknown;
  readonly agent?: AgentLike;

  constructor(options: OfficeAgentSessionOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.agentDir = options.agentDir ?? process.cwd();
    this.model = options.model;
  }
}
