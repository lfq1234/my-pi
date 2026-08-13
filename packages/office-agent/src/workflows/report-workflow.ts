import type { OfficeAgentRunInput, OfficeAgentRunResult } from "../core/types.ts";
import { createOfficeAgent } from "../core/office-agent.ts";

export async function runOfficeReportWorkflow(input: OfficeAgentRunInput = {}): Promise<OfficeAgentRunResult> {
  const agent = createOfficeAgent();
  return await agent.run(input);
}
