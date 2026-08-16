/**
 * PDF 导出（FR-1.6，底层 `pdf-lib` / `sharp`）。
 *
 * 把单张 PNG（海报文字层合成结果）嵌入一页 PDF。尺寸取 PNG 实际像素，
 * 保持 1:1，避免缩放导致模糊。
 */
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

export async function pngToPdf(png: Buffer): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error("pngToPdf: 无法读取 PNG 尺寸");
  }
  const doc = await PDFDocument.create();
  const page = doc.addPage([width, height]);
  const image = await doc.embedPng(png);
  page.drawImage(image, { x: 0, y: 0, width, height });
  return Buffer.from(await doc.save());
}
