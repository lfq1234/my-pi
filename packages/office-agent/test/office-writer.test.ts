import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { createWordDocument, createExcelWorkbook, createPowerPointDeck } from "../src/index.ts";

test("createWordDocument builds a valid docx package", async () => {
  const bytes = await createWordDocument({ title: "Quarterly Review", paragraphs: ["Revenue up 18%", "Retention improved."] });
  const zip = await JSZip.loadAsync(bytes);

  assert.equal(zip.file("word/document.xml") !== null, true);
  const xml = await zip.file("word/document.xml")!.async("string");
  assert.match(xml, /Quarterly Review/);
  assert.match(xml, /Revenue up 18%/);
});

test("createExcelWorkbook builds a valid xlsx package", async () => {
  const bytes = await createExcelWorkbook({
    sheetName: "Sales",
    rows: [["Month", "Revenue"], ["Jan", "120k"], ["Feb", "140k"]],
  });

  const zip = await JSZip.loadAsync(bytes);
  assert.equal(zip.file("xl/workbook.xml") !== null, true);
  assert.equal(zip.file("xl/worksheets/sheet1.xml") !== null, true);
  const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  assert.match(xml, /120k/);
});

test("createPowerPointDeck builds a valid pptx package", async () => {
  const bytes = await createPowerPointDeck({ title: "Board Update", slides: ["Revenue up 18%", "Pipeline healthy"] });
  const zip = await JSZip.loadAsync(bytes);

  assert.equal(zip.file("ppt/presentation.xml") !== null, true);
  assert.equal(zip.file("ppt/slides/slide1.xml") !== null, true);
  const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  assert.match(xml, /Revenue up 18%/);
});
