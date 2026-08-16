/**
 * xlsx 生成（FR-1.2，底层 `exceljs` npm）。
 *
 * 注意：exceljs 是 CJS 且通过 `module.exports = require(...)` 间接导出，
 * Node ESM 无法静态识别其命名导出（Named export not found），
 * 因此用 createRequire 取 module.exports 再解构（类型仍来自 exceljs 自带 d.ts）。
 */
import { createRequire } from "node:module";
import { stat } from "node:fs/promises";
import type { DeliveryArtifact } from "../types.ts";
import type { SheetInput } from "./types.ts";

const require = createRequire(import.meta.url);
const { Workbook } = require("exceljs") as typeof import("exceljs");

export async function renderXlsx(input: SheetInput): Promise<DeliveryArtifact> {
  const workbook = new Workbook();
  for (const sheet of input.sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) {
      ws.addRow(row);
    }
    // 首行加粗做表头（可选增强，不影响契约）
    ws.getRow(1).font = { bold: true };
  }
  await workbook.xlsx.writeFile(input.outPath);
  const s = await stat(input.outPath);
  return {
    kind: "xlsx",
    path: input.outPath,
    label: input.sheets[0]?.name ?? "sheet",
    bytes: s.size,
    createdAt: Date.now(),
  };
}
