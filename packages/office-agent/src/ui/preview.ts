export function renderPreviewSummary(title: string, summary: string): string {
  return `
    <div>
      <h2>${title}</h2>
      <p>${summary}</p>
    </div>
  `;
}
