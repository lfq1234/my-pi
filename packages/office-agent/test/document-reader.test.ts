import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { test } from "node:test";
import { readOfficeFile } from "../src/core/document-reader.ts";

test("readOfficeFile extracts simple text from a docx file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "office-docx-"));
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Quarterly revenue increased 18%</w:t></w:r></w:p>
          <w:p><w:r><w:t>We expanded to three new regions.</w:t></w:r></w:p>
        </w:body>
      </w:document>`,
  );

  const filePath = join(dir, "quarterly.docx");
  await writeFile(filePath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

  const result = await readOfficeFile(filePath);

  assert.equal(result.document.kind, "docx");
  assert.match(result.document.content, /Quarterly revenue increased 18%/);
  assert.match(result.document.summary, /Quarterly revenue increased 18%/);
});

test("readOfficeFile keeps plain text content for markdown files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "office-txt-"));
  const filePath = join(dir, "notes.md");
  await writeFile(filePath, "# Weekly summary\n\nRevenue is stable this week.\n\nNext step: prepare board pack.");

  const result = await readOfficeFile(filePath);

  assert.equal(result.document.kind, "markdown");
  assert.match(result.document.content, /Revenue is stable this week/);
  assert.match(result.document.summary, /Revenue is stable this week/);
});

test("readOfficeFile recognizes WPS-style Office files and extracts XML text", async () => {
  const dir = await mkdtemp(join(tmpdir(), "office-wps-"));
  const zip = new JSZip();
  zip.file("docInfo.xml", "<body><p><t>WPS summary: revenue is stable.</t></p></body>");

  const filePath = join(dir, "report.wps");
  await writeFile(filePath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

  const result = await readOfficeFile(filePath);

  assert.equal(result.document.kind, "wps");
  assert.match(result.document.content, /WPS summary: revenue is stable\./);
});
