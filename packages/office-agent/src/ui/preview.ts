import { buildPreviewPage } from "../tools/html-generator.ts";

export interface PreviewPageInput {
  title: string;
  summary: string;
  documentSections?: Array<{ title: string; content: string; bullets?: string[] }>;
  posterPrompt?: string;
  emailSubject?: string;
  emailBody?: string;
  files?: Array<{ fileName: string; summary: string }>;
}

export function renderPreviewSummary(title: string, summary: string): string {
  return `
    <div>
      <h2>${title}</h2>
      <p>${summary}</p>
    </div>
  `;
}

export function createPreviewPage(input: PreviewPageInput): string {
  return buildPreviewPage(input);
}
