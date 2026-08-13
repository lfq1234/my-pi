import { makeId, nowIso } from "./utils.ts";
import type { GeneratedReport, OfficeReportSection } from "./types.ts";

export function buildHtmlReport(title: string, summary: string, sections: OfficeReportSection[]): string {
  const safeTitle = escapeHtml(title);
  const safeSummary = escapeHtml(summary);
  const sectionHtml = sections
    .map((section) => {
      const bulletHtml = (section.bullets ?? []).length
        ? `<ul>${section.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
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
        max-width: 960px;
        margin: 40px auto;
        padding: 24px;
      }
      .header {
        background: linear-gradient(135deg, #1e3a8a, #2563eb);
        color: white;
        border-radius: 16px;
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
        border-left: 4px solid #60a5fa;
      }
      .card {
        background: white;
        border-radius: 12px;
        padding: 20px;
        margin-top: 18px;
        box-shadow: 0 6px 20px rgba(15, 23, 42, 0.05);
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
        <strong>Summary</strong>
        <p>${safeSummary}</p>
      </div>
      ${sectionHtml}
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
