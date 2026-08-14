import { resolve } from "node:path";
import { createGeneratedReport, buildPreviewPage } from "../tools/html-generator.ts";
import { createEmailDraft } from "../tools/email-generator.ts";
import { createPosterBrief } from "../tools/poster-brief.ts";
import { readOfficeDirectory } from "../core/document-reader.ts";
import { EmailClient } from "../services/email-client.ts";
import { SeedanceClient } from "../services/seedance-client.ts";
import { ensureDir, writeTextFile } from "../utils.ts";

export interface OfficeWorkflowInput {
  directory?: string;
  title?: string;
  summary?: string;
  audience?: string;
  style?: string;
  to?: string;
}

export interface OfficeArtifactWorkflowResult {
  outputDir: string;
  report: ReturnType<typeof createGeneratedReport>;
  emailDraft: ReturnType<typeof createEmailDraft>;
  posterBrief: ReturnType<typeof createPosterBrief>;
  previewPath: string;
  summaryPath: string;
  files: Array<{ fileName: string; summary: string; path: string }>;
  seedanceStatus: string;
  emailStatus: string;
}

export async function runOfficeArtifactWorkflow(input: OfficeWorkflowInput = {}): Promise<OfficeArtifactWorkflowResult> {
  const directory = input.directory ?? process.cwd();
  const documents = await readOfficeDirectory(directory);
  const title = input.title ?? "Office Summary";
  const audience = input.audience ?? "general audience";
  const style = input.style ?? "modern executive";
  const targetSummary = input.summary ?? documents.map((doc) => doc.summary).join("\n");

  const sections = [
    {
      title: "Document Summary",
      content: targetSummary || "No document summary was available.",
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

  const report = createGeneratedReport(title, targetSummary || "No executive summary available.", sections);
  const emailDraft = createEmailDraft(input.to ?? "team@example.com", `${title} update`, targetSummary, "professional");
  const posterBrief = createPosterBrief(title, audience, style, targetSummary);

  const seedanceClient = new SeedanceClient();
  const seedance = await seedanceClient.generateImage({
    prompt: posterBrief.prompt,
    style,
    ratio: "16:9",
  });

  const emailClient = new EmailClient("mock");
  const emailSend = await emailClient.sendEmail({
    to: input.to ?? "team@example.com",
    subject: emailDraft.subject,
    body: emailDraft.body,
    provider: "mock",
  });

  const outputDir = resolve(process.cwd(), ".office-agent-output", `workflow-${Date.now()}`);
  await ensureDir(outputDir);

  const previewHtml = buildPreviewPage({
    title,
    summary: targetSummary || "No summary available.",
    documentSections: sections,
    posterPrompt: posterBrief.prompt,
    emailSubject: emailDraft.subject,
    emailBody: emailDraft.body,
    files: documents.map((document) => ({
      fileName: document.fileName,
      summary: document.summary,
    })),
  });

  const previewPath = resolve(outputDir, "preview.html");
  const summaryPath = resolve(outputDir, "summary.md");
  const htmlPath = resolve(outputDir, "report.html");

  await writeTextFile(htmlPath, report.html);
  await writeTextFile(previewPath, previewHtml);
  await writeTextFile(summaryPath, `# ${title}\n\n${targetSummary}\n`);

  return {
    outputDir,
    report,
    emailDraft,
    posterBrief,
    previewPath,
    summaryPath,
    files: documents.map((document) => ({
      fileName: document.fileName,
      summary: document.summary,
      path: document.filePath,
    })),
    seedanceStatus: seedance.status,
    emailStatus: emailSend.status,
  };
}

export async function runOfficeWorkflow(input: OfficeWorkflowInput = {}): Promise<OfficeArtifactWorkflowResult> {
  return runOfficeArtifactWorkflow(input);
}
