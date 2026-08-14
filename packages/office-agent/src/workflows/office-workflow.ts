import { createGeneratedReport } from "../tools/html-generator.ts";
import { createEmailDraft } from "../tools/email-generator.ts";
import { createPosterBrief } from "../tools/poster-brief.ts";
import { readOfficeDirectory } from "../core/document-reader.ts";
import { writeTextFile } from "../utils.ts";
import { resolve } from "node:path";

export interface OfficeWorkflowInput {
  directory?: string;
  title?: string;
  summary?: string;
  audience?: string;
  style?: string;
  to?: string;
}

export async function runOfficeWorkflow(input: OfficeWorkflowInput = {}): Promise<{ outputDir: string; report: any; emailDraft: any; posterBrief: any; documents: any[] }> {
  const directory = input.directory ?? process.cwd();
  const documents = await readOfficeDirectory(directory);

  const title = input.title ?? "Office Summary";
  const summary = input.summary ?? documents.map((doc) => doc.summary).join("\n");
  const audience = input.audience ?? "general audience";
  const style = input.style ?? "modern executive";

  const sections = [
    {
      title: "Document Summary",
      content: summary,
      bullets: documents.map((doc) => `${doc.fileName}: ${doc.summary}`),
    },
    {
      title: "Action Points",
      content: "The following deliverables were prepared as part of the Office Agent workflow.",
      bullets: [
        "Create a formatted HTML report.",
        "Prepare a follow-up email draft.",
        "Draft a poster concept suitable for review.",
      ],
    },
  ];

  const report = createGeneratedReport(title, summary, sections);
  const emailDraft = createEmailDraft(input.to ?? "team@example.com", `${title} update`, summary, "professional");
  const posterBrief = createPosterBrief(title, audience, style, summary);

  const outputDir = resolve(process.cwd(), ".office-agent-output", `workflow-${Date.now()}`);
  await writeTextFile(resolve(outputDir, "report.html"), report.html);
  await writeTextFile(resolve(outputDir, "summary.md"), `# ${title}\n\n${summary}\n`);

  return {
    outputDir,
    report,
    emailDraft,
    posterBrief,
    documents,
  };
}
