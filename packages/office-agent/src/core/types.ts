export type OfficeFileKind =
  | "markdown"
  | "txt"
  | "html"
  | "pdf"
  | "docx"
  | "xlsx"
  | "csv"
  | "pptx"
  | "unknown";

export type OutputFormat = "html" | "markdown" | "json" | "txt";
export type EmailProvider = "mock" | "smtp" | "graph" | "webhook";

export interface OfficeDocument {
  id: string;
  fileName: string;
  filePath: string;
  kind: OfficeFileKind;
  summary: string;
  content: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface OfficeDocumentSummary {
  title: string;
  summary: string;
  sections: OfficeReportSection[];
  warnings: string[];
}

export interface OfficeReportSection {
  title: string;
  content: string;
  bullets?: string[];
}

export interface GeneratedReport {
  id: string;
  title: string;
  summary: string;
  sections: OfficeReportSection[];
  html: string;
  createdAt: string;
}

export interface EmailDraft {
  id: string;
  to: string;
  subject: string;
  body: string;
  tone: "professional" | "friendly" | "concise";
  createdAt: string;
}

export interface PosterBrief {
  id: string;
  theme: string;
  audience: string;
  style: string;
  prompt: string;
  status: "draft" | "ready" | "generated";
  createdAt: string;
}

export interface PreviewArtifact {
  html: string;
  path: string;
}

export interface OfficeAgentOptions {
  defaultOutputDir?: string;
  defaultTitle?: string;
}

export interface OfficeAgentRunInput {
  inputFiles?: string[];
  title?: string;
  summary?: string;
  context?: string;
  audience?: string;
  style?: string;
}

export interface OfficeAgentRunResult {
  documents: OfficeDocument[];
  report: GeneratedReport;
  emailDraft: EmailDraft;
  posterBrief: PosterBrief;
  outputDir: string;
  preview?: PreviewArtifact;
}
