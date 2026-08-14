import { readdir, readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { makeId, nowIso } from "../utils.ts";
import { detectFileKind } from "./office-agent.ts";
import type { OfficeDocument, OfficeDocumentSummary, OfficeFileKind, OfficeReportSection } from "./types.ts";

export interface ReadOfficeFileResult {
  document: OfficeDocument;
  parsed: boolean;
}

export async function readOfficeFile(filePath: string): Promise<ReadOfficeFileResult> {
  const resolved = resolve(filePath);
  const kind = detectFileKind(resolved);

  let content = "";
  let parsed = true;
  const warnings: string[] = [];

  try {
    content = await readFileTextByKind(resolved, kind);
  } catch {
    content = `Office Agent could not read this file automatically: ${resolved}`;
    parsed = false;
    warnings.push("The file could not be parsed automatically and was preserved as raw fallback content.");
  }

  const summary = buildSummary(content);
  const structured = buildStructuredSummary(content, kind, warnings);

  return {
    document: {
      id: makeId("doc"),
      fileName: resolved.split(/[\\/]/).pop() ?? "document",
      filePath: resolved,
      kind,
      summary: structured.summary,
      content,
      metadata: {
        extension: extname(resolved),
        kind,
        parsed,
        warningCount: warnings.length,
      },
      createdAt: nowIso(),
    },
    parsed,
  };
}

export async function readOfficeDirectory(dirPath: string): Promise<OfficeDocument[]> {
  const resolved = resolve(dirPath);
  const files = await listSupportedFiles(resolved);
  const documents: OfficeDocument[] = [];

  for (const file of files) {
    const result = await readOfficeFile(file);
    documents.push(result.document);
  }

  return documents;
}

export async function extractDocumentStructure(filePath: string): Promise<OfficeDocumentSummary> {
  const { document } = await readOfficeFile(filePath);
  const warnings = (document.metadata.warningCount && Number(document.metadata.warningCount) > 0)
    ? ["The parser used a fallback path for this file."]
    : [];

  return {
    title: inferDocumentTitle(document.fileName, document.content),
    summary: document.summary,
    sections: buildSections(document.content, detectFileKind(filePath), warnings),
    warnings,
  };
}

async function listSupportedFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(dirPath, entry.name);
    const fileStat = await stat(fullPath);

    if (fileStat.isDirectory()) {
      results.push(...(await listSupportedFiles(fullPath)));
      continue;
    }

    const ext = extname(fullPath).toLowerCase();
    const supported = [
      ".md",
      ".txt",
      ".html",
      ".htm",
      ".csv",
      ".pdf",
      ".docx",
      ".xlsx",
      ".pptx",
    ];

    if (supported.includes(ext)) {
      results.push(fullPath);
    }
  }

  return results;
}

async function readFileTextByKind(filePath: string, kind: OfficeFileKind): Promise<string> {
  const raw = await readFile(filePath, "utf8");

  switch (kind) {
    case "markdown":
    case "txt":
      return raw;
    case "html":
      return extractHtmlText(raw);
    case "csv":
      return normalizeCsvToText(raw);
    case "pdf":
      return `PDF extraction is partially supported. File: ${filePath}\n\nText preview: ${raw.slice(0, 500)}`;
    case "docx":
      return `DOCX parsing is partial and should be treated as a text preview. File: ${filePath}\n\nText preview: ${raw.slice(0, 500)}`;
    case "xlsx":
      return `XLSX parsing is partial and should be treated as a text preview. File: ${filePath}\n\nText preview: ${raw.slice(0, 500)}`;
    case "pptx":
      return `PPTX parsing is partial and should be treated as a text preview. File: ${filePath}\n\nText preview: ${raw.slice(0, 500)}`;
    default:
      return raw || `Unsupported file type for office agent: ${filePath}`;
  }
}

function normalizeCsvToText(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.join("\n");
}

function extractHtmlText(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferDocumentTitle(fileName: string, content: string): string {
  const normalizedName = fileName.replace(/\.[^.]+$/, "");
  const headingMatch = content.match(/^(?:#{1,6}\s+)?(.+)$/m);
  if (headingMatch && headingMatch[1].trim()) {
    return headingMatch[1].trim();
  }
  return normalizedName || "Office document";
}

function buildSummary(content: string): string {
  if (!content.trim()) {
    return "No content available.";
  }

  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 260 ? `${compact.slice(0, 257).trim()}...` : compact;
}

function buildStructuredSummary(content: string, kind: OfficeFileKind, warnings: string[]): OfficeDocumentSummary {
  const clean = content.replace(/\s+/g, " ").trim();
  const bullets = extractKeyBullets(clean);

  const sections: OfficeReportSection[] = [
    {
      title: "Overview",
      content: clean.slice(0, 220) || "No text content available.",
      bullets: bullets.slice(0, 4),
    },
    {
      title: "Source Type",
      content: `Detected format: ${kind}`,
      bullets: warnings.length > 0 ? warnings : ["Content was extracted and normalized for downstream report generation."],
    },
  ];

  return {
    title: inferDocumentTitle("document", content),
    summary: buildSummary(content),
    sections,
    warnings,
  };
}

function extractKeyBullets(content: string): string[] {
  return content
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 25)
    .slice(0, 5);
}

function buildSections(content: string, kind: OfficeFileKind, warnings: string[]): OfficeReportSection[] {
  const summary = buildSummary(content);
  const cues = extractKeyBullets(content);
  return [
    {
      title: "Document Summary",
      content: summary,
      bullets: cues.length > 0 ? cues.slice(0, 4) : ["No additional key points were extracted."],
    },
    {
      title: "Processing Notes",
      content: `Normalized ${kind} content for report generation.`,
      bullets: warnings.length > 0 ? warnings : ["This file was processed without fallback warnings."],
    },
  ];
}
