import { makeId, nowIso } from "../utils.ts";
import type { GeneratedReport, OfficeReportSection } from "../core/types.ts";

export function buildHtmlReport(title: string, summary: string, sections: OfficeReportSection[]): string {
  const safeTitle = escapeHtml(title);
  const safeSummary = escapeHtml(summary);
  const sectionHtml = sections
    .map((section) => {
      const bullets = section.bullets ?? [];
      const bulletHtml = bullets.length
        ? `<ul>${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : "";
      return `
        <section class="card">
          <h2>${escapeHtml(section.title)}</h2>
          <p>${escapeHtml(section.content)}</p>
          ${bulletHtml}
        </section>
      `;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      body {
        margin: 0;
        font-family: "Segoe UI", Arial, sans-serif;
        background: #f5f7fb;
        color: #1f2937;
      }
      .container {
        max-width: 1100px;
        margin: 40px auto;
        padding: 24px;
      }
      .header {
        background: linear-gradient(135deg, #1e3a8a, #2563eb);
        color: white;
        border-radius: 18px;
        padding: 28px;
        box-shadow: 0 10px 24px rgba(37, 99, 235, 0.18);
      }
      .header h1 {
        margin: 0 0 8px;
      }
      .summary {
        margin-top: 20px;
        padding: 18px 20px;
        background: white;
        border-radius: 12px;
        border-left: 5px solid #60a5fa;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 18px;
        margin-top: 18px;
      }
      .card {
        background: white;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 6px 20px rgba(15, 23, 42, 0.05);
      }
      .poster {
        min-height: 180px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #e0f2fe, #f5f3ff);
        border: 1px solid #dbeafe;
        border-radius: 12px;
      }
      ul {
        margin: 12px 0 0 18px;
      }
      li {
        margin: 6px 0;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>${safeTitle}</h1>
      </div>
      <div class="summary">
        <strong>Executive Summary</strong>
        <p>${safeSummary}</p>
      </div>
      <div class="grid">
        ${sectionHtml}
      </div>
    </div>
  </body>
</html>`;
}

export function createGeneratedReport(title: string, summary: string, sections: OfficeReportSection[]): GeneratedReport {
  return {
    id: makeId("report"),
    title,
    summary,
    sections,
    html: buildHtmlReport(title, summary, sections),
    createdAt: nowIso(),
  };
}

export function buildPreviewPage(args: {
  title: string;
  summary: string;
  documentSections?: OfficeReportSection[];
  posterPrompt?: string;
  emailSubject?: string;
  emailBody?: string;
  files?: Array<{ fileName: string; summary: string }>;
}): string {
  const cards = (args.documentSections ?? []).map((section) => {
    const bullets = section.bullets ?? [];
    const bulletHtml = bullets.length
      ? `<ul>${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "";
    return `
      <section class="card">
        <h2>${escapeHtml(section.title)}</h2>
        <p>${escapeHtml(section.content)}</p>
        ${bulletHtml}
      </section>
    `;
  }).join("\n");

  const fileList = (args.files ?? []).map((item) => `
    <div class="card">
      <strong>${escapeHtml(item.fileName)}</strong>
      <p>${escapeHtml(item.summary)}</p>
    </div>
  `).join("\n");

  const poster = args.posterPrompt
    ? `<div class="poster"><div><strong>Poster concept</strong><p>${escapeHtml(args.posterPrompt)}</p></div></div>`
    : `<div class="poster"><div><strong>Poster concept</strong><p>No poster prompt generated yet.</p></div></div>`;

  const email = args.emailBody
    ? `<div class="card"><h3>${escapeHtml(args.emailSubject ?? "Email draft")}</h3><pre>${escapeHtml(args.emailBody)}</pre></div>`
    : `<div class="card"><h3>Email draft</h3><p>No email content generated yet.</p></div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(args.title)}</title>
    <style>
      body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: #f4f7fb; color: #111827; }
      .container { max-width: 1180px; margin: 36px auto; padding: 20px; }
      .hero { background: linear-gradient(135deg, #0f172a, #1d4ed8); color: white; border-radius: 18px; padding: 28px; }
      .summary { margin-top: 20px; background: white; padding: 20px; border-radius: 12px; border-left: 5px solid #60a5fa; }
      .two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; margin-top: 20px; }
      .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06); }
      .poster { min-height: 180px; border-radius: 12px; padding: 20px; background: linear-gradient(135deg, #e0f2fe, #f5f3ff); }
      pre { white-space: pre-wrap; word-break: break-word; font-family: "Segoe UI", sans-serif; }
      ul { margin: 12px 0 0 18px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="hero">
        <h1>${escapeHtml(args.title)}</h1>
      </div>
      <div class="summary">
        <strong>Executive summary</strong>
        <p>${escapeHtml(args.summary)}</p>
      </div>
      <div class="two-col">
        ${cards}
      </div>
      <div class="two-col">
        <div class="card">
          <h3>Files overview</h3>
          ${fileList || "<p>No files were supplied.</p>"}
        </div>
        ${poster}
      </div>
      <div class="two-col">
        ${email}
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
