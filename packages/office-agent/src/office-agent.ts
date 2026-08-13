import { readdir, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createGeneratedReport } from "../tools/html-generator.ts";
import { createEmailDraft } from "../tools/email-generator.ts";
import { createPosterBrief } from "../tools/poster-brief.ts";
import { ensureDir, makeId, nowIso, normalizeOutputDirectory, readTextFile, writeTextFile } from "../utils.ts";
import type { OfficeAgentOptions, OfficeAgentRunInput, OfficeAgentRunResult, OfficeDocument, OfficeFileKind } from "./types.ts";

export class OfficeAgent {
  private readonly defaultOutputDir: string;
  private readonly defaultTitle: string;

  constructor(options: OfficeAgentOptions = {}) {
    this.defaultOutputDir = options.defaultOutputDir ?? resolve(process.cwd(), ".office-agent-output");
    this.defaultTitle = options.defaultTitle ?? "Office Agent Report";
  }

  async run(input: OfficeAgentRunInput = {}): Promise<OfficeAgentRunResult> {
    const outputDir = normalizeOutputDirectory(this.defaultOutputDir, `run-${Date.now()}`);
    await ensureDir(outputDir);

    const inputFiles = input.inputFiles ?? [];
    const baseTitle = input.title ?? this.defaultTitle;

    const documents: OfficeDocument[] = [];
    for (const file of inputFiles) {
      const document = await this.readDocument(file);
      documents.push(document);
    }

    const content = documents.length > 0
      ? documents.map((doc) => `## ${doc.fileName}\n${doc.summary}\n\n${doc.content}`).join("\n\n")
      : input.context ?? "No office files were provided. This is a start of an office agent workflow.";

    const summary = input.summary ?? this.buildSummary(content);
    const reportSections = [
      {
        title: "Key Summary",
        content: summary,
        bullets: [
          "Office materials were collected and summarized.",
          "The report was organized into a clear executive structure.",
          "Results can be exported as HTML for easy review.",
        ],
      },
      {
        title: "Context Overview",
        content: content.slice(0, 500) || "No detailed context was provided.",
      },
    ];

    const report = createGeneratedReport(baseTitle, summary, reportSections);
    const emailDraft = createEmailDraft("team@example.com", `${baseTitle} update`, summary, "professional");
    const posterBrief = createPosterBrief(baseTitle, input.audience ?? "general audience", input.style ?? "modern business", summary);

    const htmlPath = resolve(outputDir, "report.html");
    await writeTextFile(htmlPath, report.html);

    const summaryPath = resolve(outputDir, "summary.md");
    await writeTextFile(summaryPath, `# ${baseTitle}\n\n${summary}\n`);

    return {
      documents,
      report,
      emailDraft,
      posterBrief,
      outputDir,
    };
  }

  async readDocument(filePath: string): Promise<OfficeDocument> {
    const resolved = resolve(filePath);
    const content = await readTextFile(resolved);
    const kind = detectFileKind(resolved);
    const summary = this.buildSummary(content);

    return {
      id: makeId("doc"),
      fileName: resolved.split(/[\\/]/).pop() ?? "document",
      filePath: resolved,
      kind,
      summary,
      content,
      metadata: {
        size: (await stat(resolved)).size,
        extension: extname(resolved),
        kind,
      },
      createdAt: nowIso(),
    };
  }

  async listFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.listFiles(fullPath)));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  private buildSummary(content: string): string {
    if (!content.trim()) {
      return "No content was available for summarization.";
    }

    const normalized = content.replace(/\s+/g, " ").trim();
    return normalized.length > 260 ? `${normalized.slice(0, 257).trim()}...` : normalized;
  }
}

export function detectFileKind(filePath: string): OfficeFileKind {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".md":
      return "markdown";
    case ".txt":
      return "txt";
    case ".html":
    case ".htm":
      return "html";
    case ".pdf":
      return "pdf";
    case ".doc":
    case ".docx":
      return "docx";
    case ".xls":
    case ".xlsx":
      return "xlsx";
    case ".csv":
      return "csv";
    case ".ppt":
    case ".pptx":
      return "pptx";
    default:
      return "unknown";
  }
}

export function createOfficeAgent(options: OfficeAgentOptions = {}): OfficeAgent {
  return new OfficeAgent(options);
}
