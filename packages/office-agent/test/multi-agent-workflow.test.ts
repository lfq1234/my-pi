import assert from "node:assert/strict";
import { test } from "node:test";
import { runOfficeMultiAgentWorkflow } from "../src/runtime/multi-agent-workflow.ts";

test("runOfficeMultiAgentWorkflow supports chain execution and produces final output", async () => {
  const result = await runOfficeMultiAgentWorkflow({
    mode: "chain",
    tasks: [
      {
        role: "reader",
        prompt: "Read the document and list the 3 most important facts.",
        context: "Revenue grew 12% this quarter. Customer retention improved. We launched a new executive dashboard.",
      },
      {
        role: "writer",
        prompt: "Using {previous}, compose a concise executive summary in 2 sentences.",
      },
    ],
  });

  assert.equal(result.mode, "chain");
  assert.equal(result.results.length, 2);
  assert.ok(result.finalOutput.length > 0);
  assert.match(result.finalOutput, /Revenue|retention|dashboard|executive summary/i);
});

test("runOfficeMultiAgentWorkflow supports parallel execution", async () => {
  const result = await runOfficeMultiAgentWorkflow({
    mode: "parallel",
    tasks: [
      {
        role: "planner",
        prompt: "Outline the key workstreams for the project.",
        context: "We are preparing a quarterly business update.",
      },
      {
        role: "reviewer",
        prompt: "Check the summary for risk and tone issues.",
        context: "The summary should be concise and executive-friendly.",
      },
    ],
  });

  assert.equal(result.mode, "parallel");
  assert.equal(result.results.length, 2);
  assert.ok(result.results.every((entry) => entry.status === "completed"));
});
