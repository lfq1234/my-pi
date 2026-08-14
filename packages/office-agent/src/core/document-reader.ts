import { readdir, readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { makeId, nowIso } from "../utils.ts";
import { detectFileKind } from "./office-agent.ts";
import type { OfficeDocument, OfficeFileKind } from "./types.ts";

export interface ReadOfficeFileResult {
  document: OfficeDocument;
  parsed: boolean;
}

export async function readOfficeFile(filePath: string): Promise<ReadOfficeFileResult> {
  const resolved = resolve(filePath);
  const kind = detectFileKind(resolved);

  let content = "";
  let parsed = true;

  try {
    content = await readFileTextByKind(resolved, kind);
  } catch {
    content = `Office Agent could not read this file automatically: ${resolved}`;
    parsed = false;
  }

  const summary = buildSummary(content);

  return {
    document: {
      id: makeId("doc"),
      fileName: resolved.split(/[\\/]/).pop() ?? "document",
      filePath: resolved,
      kind,
      summary,
      content,
      metadata: {
        extension: extname(resolved),
        kind,
        parsed,
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
      return raw;
    case "csv":
      return normalizeCsvToText(raw);
    case "pdf":
      return `PDF extraction not implemented in Stage 02. File: ${filePath}\n\nExtracted placeholder content: ${raw.slice(0, 300)}`;
    case "docx":
      return `DOCX parsing is deferred to later stages. File: ${filePath}\n\nRaw placeholder preview: ${raw.slice(0, 300)}`;
    case "xlsx":
      return `XLSX parsing is deferred to later stages. File: ${filePath}\n\nRaw placeholder preview: ${raw.slice(0, 300)}`;
    case "pptx":
      return `PPTX parsing is deferred to later stages. File: ${filePath}\n\nRaw placeholder preview: ${raw.slice(0, 300)}`;
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

function buildSummary(content: string): string {
  if (!content.trim()) {
    return "No content available.";
  }

  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 260 ? `${compact.slice(0, 257).trim()}...` : compact;
}
