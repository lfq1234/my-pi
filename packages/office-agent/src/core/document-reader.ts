import { readdir, readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { extractDocumentText, detectSourceType } from "../ingestion/office-parser.ts";
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    content = `Office Agent could not read this file automatically: ${resolved}\nReason: ${message}`;
    parsed = false;
    warnings.push("The file could not be parsed automatically and was preserved as raw fallback content.");
  }

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
  const fileBuffer = await readFile(filePath);

  const sourceKind = await detectSourceType(filePath);
  if (sourceKind !== kind && sourceKind !== "unknown") {
    return extractDocumentText(filePath);
  }

  switch (kind) {
    case "markdown":
    case "txt":
      return fileBuffer.toString("utf8");
    case "html":
      return extractHtmlText(fileBuffer.toString("utf8"));
    case "csv":
      return normalizeCsvToText(fileBuffer.toString("utf8"));
    case "pdf":
      return await extractPdfText(fileBuffer);
    case "docx":
      return await extractDocxText(fileBuffer);
    case "wps":
      return await extractWpsCompatibleText(fileBuffer, "doc");
    case "xlsx":
      return await extractXlsxText(fileBuffer);
    case "et":
      return await extractWpsCompatibleText(fileBuffer, "sheet");
    case "pptx":
      return await extractPptxText(fileBuffer);
    case "dps":
      return await extractWpsCompatibleText(fileBuffer, "slide");
    default:
      return fileBuffer.toString("utf8") || `Unsupported file type for office agent: ${filePath}`;
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xmlCandidates = Object.keys(zip.files)
    .filter((name) => name.endsWith(".xml") && /(^|\/)(word|document)\//i.test(name));

  const parts: string[] = [];
  for (const name of xmlCandidates) {
    const entry = zip.file(name);
    if (!entry) continue;

    const xml = await entry.async("string");
    const values = Array.from(xml.matchAll(/<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>/g))
      .map((match) => decodeXmlText(match[1]))
      .filter(Boolean);

    if (values.length > 0) {
      parts.push(values.join(" "));
    }
  }

  return parts.join("\n\n").trim() || "DOCX file was loaded but no text nodes were found.";
}

async function extractXlsxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStrings: string[] = [];

  const sharedStringsFile = zip.file("xl/sharedStrings.xml");
  if (sharedStringsFile) {
    const shared = await sharedStringsFile.async("string");
    const matches = Array.from(shared.matchAll(/<si[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/g));
    for (const match of matches) {
      const normalized = decodeXmlText(match[1]).trim();
      if (normalized) {
        sharedStrings.push(normalized);
      }
    }
  }

  const sheetNames = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort();

  const sheetParts: string[] = [];
  for (const name of sheetNames) {
    const entry = zip.file(name);
    if (!entry) continue;

    const xml = await entry.async("string");
    const rows: string[] = [];
    const matches = Array.from(xml.matchAll(/<c[^>]*t="([^"]+)"[^>]*>([\s\S]*?)<\/c>/g));

    for (const match of matches) {
      const cellType = match[1];
      const cellValue = match[2];
      let text = "";

      if (cellType === "s") {
        const indexMatch = cellValue.match(/<v>(\d+)<\/v>/);
        const index = indexMatch ? Number(indexMatch[1]) : -1;
        text = index >= 0 && sharedStrings[index] ? sharedStrings[index] : "";
      } else {
        const inline = cellValue.match(/<v>([\s\S]*?)<\/v>/) ?? cellValue.match(/<t>([\s\S]*?)<\/t>/);
        text = inline ? decodeXmlText(inline[1]) : "";
      }

      if (text.trim()) {
        rows.push(text.trim());
      }
    }

    if (rows.length > 0) {
      sheetParts.push(`Sheet: ${name}\n${rows.join(" | ")}`);
    }
  }

  return sheetParts.join("\n\n").trim() || "XLSX file was loaded but no worksheet text was found.";
}

async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort();

  const parts: string[] = [];
  for (const name of slideFiles) {
    const entry = zip.file(name);
    if (!entry) continue;

    const xml = await entry.async("string");
    const values = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g))
      .map((match) => decodeXmlText(match[1]))
      .filter(Boolean);

    if (values.length > 0) {
      parts.push(values.join(" "));
    }
  }

  return parts.join("\n\n").trim() || "PPTX file was loaded but no slide text was found.";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const raw = buffer.toString("latin1");
  const matches = Array.from(raw.matchAll(/\((?:\\.|[^()\\])*\)/g));

  const decoded = matches
    .map((match) => decodePdfText(match[0]))
    .filter(Boolean)
    .join(" ");

  return decoded.trim() || `PDF text could not be extracted automatically. File size: ${buffer.length} bytes.`;
}

async function extractWpsCompatibleText(buffer: Buffer, kind: "doc" | "sheet" | "slide"): Promise<string> {
  const zip = await JSZip.loadAsync(buffer).catch(() => null);

  if (!zip) {
    return "WPS Office file could not be opened as a ZIP-based document package.";
  }

  const xmlFiles = Object.keys(zip.files).filter((name) => name.toLowerCase().endsWith(".xml"));
  const textParts: string[] = [];
  const seen = new Set<string>();

  for (const name of xmlFiles) {
    const entry = zip.file(name);
    if (!entry) continue;

    const xml = await entry.async("string");
    const matches = Array.from(
      xml.matchAll(/<(?:w|a|c|t|v|p|s|text|Text|para|Paragraph|item)[^>]*>([\s\S]*?)<\/(?:w|a|c|t|v|p|s|text|Text|para|Paragraph|item)>/gi),
    );

    for (const match of matches) {
      const decoded = decodeXmlText(match[1]).trim();
      if (!decoded || decoded.length < 2) continue;
      if (seen.has(decoded)) continue;
      seen.add(decoded);
      textParts.push(decoded);
    }
  }

  if (textParts.length > 0) {
    return textParts.join(" \n").trim();
  }

  const raw = buffer.toString("utf8", 0, Math.min(buffer.length, 4096));
  const fallback = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

  if (fallback) {
    return `WPS-compatible ${kind} file loaded but it did not expose standard XML text nodes. Raw fallback: ${fallback}`;
  }

  return `WPS-compatible ${kind} file was loaded but no readable text content was found.`;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#xA;/g, "\n")
    .replace(/&#xD;/g, "\r")
    .replace(/&#x9;/g, "\t")
    .replace(/\s+/g, " ")
    .trim();
}

function decodePdfText(value: string): string {
  let decoded = value.slice(1, -1);
  decoded = decoded.replace(/\\([\\()])/g, "$1");
  decoded = decoded.replace(/\\n/g, "\n");
  decoded = decoded.replace(/\\r/g, "\r");
  decoded = decoded.replace(/\\t/g, "\t");
  decoded = decoded.replace(/\\b/g, "\b");
  decoded = decoded.replace(/\\f/g, "\f");
  decoded = decoded.replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
  return decoded.replace(/\s+/g, " ").trim();
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
