import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runOfficeArtifactWorkflow } from "../src/workflows/office-workflow.ts";

test("runOfficeArtifactWorkflow creates HTML email and poster artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "office-workflow-"));
  const filePath = join(root, "notes.md");
  await writeFile(filePath, "# Weekly report\n\nRevenue is stable and the sales team is on track.");

  const result = await runOfficeArtifactWorkflow({
    directory: root,
    title: "Weekly report",
    audience: "executive team",
    style: "modern executive",
    to: "team@example.com",
  });

  assert.ok(result.outputDir);
  assert.ok(result.report.title.includes("Weekly report"));
  assert.ok(result.emailDraft.subject.includes("Weekly report"));
  assert.ok(result.posterBrief.prompt.includes("executive team"));

  const html = await readFile(result.previewPath, "utf8");
  const summary = await readFile(result.summaryPath, "utf8");

  assert.match(html, /Weekly report/i);
  assert.match(summary, /Weekly report/i);
  assert.ok(result.files.length >= 1);
});
