import { OfficeAgentSession, type OfficeAgentSessionOptions } from "./agent-session.ts";

export interface AgentLike {
  readonly id?: string;
}

export interface CreateOfficeAgentSessionOptions extends OfficeAgentSessionOptions {
  cwd?: string;
  agentDir?: string;
}

export async function createOfficeAgentSession(
  options: CreateOfficeAgentSessionOptions = {},
): Promise<{ session: OfficeAgentSession; agent?: AgentLike }> {
  const session = new OfficeAgentSession(options);
  return { session, agent: session.agent };
}
