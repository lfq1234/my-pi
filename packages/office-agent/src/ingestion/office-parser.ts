import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import JSZip from "jszip";
import { extractPdfText } from "./pdf-parser.ts";

export type OfficeSourceType = "markdown" | "txt" | "html" | "pdf" | "docx" | "xlsx" | "pptx" | "wps" | "et" | "dps" | "unknown";

export async function detectSourceType(filePath: string): Promise<OfficeSourceType> {
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
    case ".wps":
    case ".wpt":
      return "wps";
    case ".xls":
    case ".xlsx":
      return "xlsx";
    case ".et":
    case ".ett":
      return "et";
    case ".csv":
      return "csv";
    case ".ppt":
    case ".pptx":
      return "pptx";
    case ".dps":
    case ".dpt":
      return "dps";
    default:
      return "unknown";
  }
}

export async function extractDocumentText(filePath: string): Promise<string> {
  const fileBuffer = await readFile(filePath);
  const kind = await detectSourceType(filePath);

  switch (kind) {
    case "markdown":
    case "txt":
      return fileBuffer.toString("utf8");
    case "html":
      return normalizeHtmlText(fileBuffer.toString("utf8"));
    case "csv":
      return normalizeCsvText(fileBuffer.toString("utf8"));
    case "pdf":
      return extractPdfText(fileBuffer);
    case "docx":
      return extractDocxText(fileBuffer);
    case "wps":
      return extractWpsXmlText(fileBuffer, "doc");
    case "xlsx":
      return extractXlsxText(fileBuffer);
    case "et":
      return extractWpsXmlText(fileBuffer, "sheet");
    case "pptx":
      return extractPptxText(fileBuffer);
    case "dps":
      return extractWpsXmlText(fileBuffer, "slide");
    default:
      return fileBuffer.toString("utf8");
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const parts: string[] = [];

  for (const name of Object.keys(zip.files)) {
    const file = zip.file(name);
    if (!file || !name.endsWith(".xml")) continue;
    const xml = await file.async("string");
    const values = Array.from(xml.matchAll(/<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>/g))
      .map((match) => decodeXmlText(match[1]))
      .filter(Boolean);
    if (values.length > 0) parts.push(values.join(" "));
  }

  const combined = parts.join("\n\n").trim();
  return combined || "DOCX file was loaded but no text nodes were found.";
}

async function extractXlsxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStrings: string[] = [];

  const sharedFile = zip.file("xl/sharedStrings.xml");
  if (sharedFile) {
    const shared = await sharedFile.async("string");
    const matches = Array.from(shared.matchAll(/<si[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/g));
    for (const match of matches) {
      const value = decodeXmlText(match[1]).trim();
      if (value) sharedStrings.push(value);
    }
  }

  const names = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort();

  const parts: string[] = [];
  for (const name of names) {
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
      if (text.trim()) rows.push(text.trim());
    }
    if (rows.length > 0) parts.push(`Sheet: ${name}\n${rows.join(" | ")}`);
  }

  return parts.join("\n\n").trim() || "XLSX file was loaded but no worksheet text was found.";
}

async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const parts: string[] = [];

  for (const name of Object.keys(zip.files)) {
    const file = zip.file(name);
    if (!file || !/^ppt\/slides\/slide\d+\.xml$/i.test(name)) continue;
    const xml = await file.async("string");
    const values = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g))
      .map((match) => decodeXmlText(match[1]))
      .filter(Boolean);
    if (values.length > 0) parts.push(values.join(" "));
  }

  return parts.join("\n\n").trim() || "PPTX file was loaded but no slide text was found.";
}

async function extractWpsXmlText(buffer: Buffer, kind: "doc" | "sheet" | "slide"): Promise<string> {
  const zip = await JSZip.loadAsync(buffer).catch(() => null);
  if (!zip) {
    return `WPS-compatible ${kind} file could not be opened as a ZIP-based document package.`;
  }

  const textParts: string[] = [];
  const seen = new Set<string>();

  for (const name of Object.keys(zip.files)) {
    const file = zip.file(name);
    if (!file || !name.toLowerCase().endsWith(".xml")) continue;
    const xml = await file.async("string");
    const matches = Array.from(
      xml.matchAll(/<(?:w|a|c|t|v|p|s|text|Text|para|Paragraph|item)[^>]*>([\s\S]*?)<\/(?:w|a|c|t|v|p|s|text|Text|para|Paragraph|item)>/gi),
    );
    for (const match of matches) {
      const decoded = decodeXmlText(match[1]).trim();
      if (!decoded || decoded.length < 2 || seen.has(decoded)) continue;
      seen.add(decoded);
      textParts.push(decoded);
    }
  }

  if (textParts.length > 0) {
    return textParts.join("\n").trim();
  }

  const raw = buffer.toString("utf8", 0, Math.min(buffer.length, 4096)).replace(/[\u0000-\u001f\u007f]/g, " ");
  const fallback = raw.replace(/\s+/g, " ").trim();
  return fallback
    ? `WPS-compatible ${kind} file loaded but it did not expose standard XML text nodes. Raw fallback: ${fallback}`
    : `WPS-compatible ${kind} file was loaded but no readable text content was found.`;
}

function normalizeHtmlText(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCsvText(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
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
