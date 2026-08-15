import type {
	OfficeMultiAgentMode,
	OfficeMultiAgentResultEntry,
	OfficeMultiAgentRole,
	OfficeMultiAgentTask,
	OfficeMultiAgentWorkflowInput,
	OfficeMultiAgentWorkflowResult,
} from "../../core/types.ts";

const ROLE_SYSTEM: Record<OfficeMultiAgentRole, string> = {
	planner: "You are the planner. Break the request into clear steps, key decisions, and a concise action plan.",
	reader: "You are the reader. Extract key facts, signals, and evidence from the provided context.",
	writer: "You are the writer. Turn the evidence into a concise, business-ready result using the provided context.",
	reviewer: "You are the reviewer. Check for risk, tone, clarity, and omissions before finalizing.",
	executor: "You are the executor. Convert the approved brief into a concrete deliverable and outputs.",
};

function formatPrompt(task: OfficeMultiAgentTask, previousOutput?: string): string {
	const prompt = task.prompt.trim();
	const transformed = prompt.includes("{previous}") ? prompt.replace(/\{previous\}/g, previousOutput ?? "") : prompt;

	const contextBlock = task.context?.trim() ? `\n\nContext:\n${task.context.trim()}` : "";
	return `${ROLE_SYSTEM[task.role]}\n\nTask:\n${transformed}${contextBlock}`;
}

function runSingleTask(task: OfficeMultiAgentTask, step: number, previousOutput?: string): OfficeMultiAgentResultEntry {
	const prompt = formatPrompt(task, previousOutput);
	const output = [
		`Role: ${task.role}`,
		`Step: ${step}`,
		`Plan: ${task.prompt}`,
		`Result: ${summarizeRuntimeOutput(prompt)}`,
	].join("\n");

	return {
		role: task.role,
		status: "completed",
		step,
		output,
		context: previousOutput,
	};
}

function summarizeRuntimeOutput(prompt: string): string {
	const text = prompt.replace(/\s+/g, " ").trim();
	if (text.length <= 220) return text;
	return `${text.slice(0, 217).trim()}...`;
}

function runParallelTasks(tasks: OfficeMultiAgentTask[]): OfficeMultiAgentResultEntry[] {
	return tasks.map((task, index) => runSingleTask(task, index + 1));
}

function runChainTasks(tasks: OfficeMultiAgentTask[]): OfficeMultiAgentResultEntry[] {
	let previousOutput: string | undefined;
	return tasks.map((task, index) => {
		const result = runSingleTask(task, index + 1, previousOutput);
		previousOutput = result.output;
		return result;
	});
}

export async function runOfficeMultiAgentWorkflow(
	input: OfficeMultiAgentWorkflowInput,
): Promise<OfficeMultiAgentWorkflowResult> {
	const mode: OfficeMultiAgentMode = input.mode ?? "single";
	const tasks = input.tasks ?? [];

	let results: OfficeMultiAgentResultEntry[];
	switch (mode) {
		case "parallel":
			results = runParallelTasks(tasks);
			break;
		case "chain":
			results = runChainTasks(tasks);
			break;
		default:
			results = tasks.length > 0 ? [runSingleTask(tasks[0], 1)] : [];
			break;
	}

	const finalOutput =
		results.length > 0
			? results.map((result) => `[${result.role}] ${result.output}`).join("\n\n")
			: "No multi-agent tasks were provided.";

	return {
		mode,
		tasks,
		results,
		finalOutput,
	};
}

export function createOfficeMultiAgentWorkflow(input: OfficeMultiAgentWorkflowInput) {
	return runOfficeMultiAgentWorkflow(input);
}
