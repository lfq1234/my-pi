import type { OfficeMultiAgentWorkflowInput, OfficeMultiAgentWorkflowResult } from "../../core/types.ts";
import { runOfficeMultiAgentWorkflow } from "../../runtime/multi-agent-workflow.ts";

export async function runOfficeMultiAgent(
	input: OfficeMultiAgentWorkflowInput,
): Promise<OfficeMultiAgentWorkflowResult> {
	return runOfficeMultiAgentWorkflow(input);
}
