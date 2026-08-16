/**
 * pptx 生成（FR-1.3，底层 `pptxgenjs` npm）。
 *
 * 注意：pptxgenjs 的 package.json exports 缺少 "." 入口键，且 d.ts 用了
 * `export as namespace` + `export default` 的组合，Node16 解析下 default import
 * 类型错乱（官方 tsc 同样报 TS2351）。这里用 createRequire 直取 CJS 导出
 * （module.exports = PptxGenJS 类，已核实），并基于其真实 API 声明最小类型。
 */

import { stat } from "node:fs/promises";
import { createRequire } from "node:module";
import type { DeliveryArtifact } from "../types.ts";
import type { SlideInput } from "./types.ts";

const require = createRequire(import.meta.url);

/** pptxgenjs 真实 API 的最小类型（addSlide/addText/writeFile，已从 types/index.d.ts 核实） */
interface PptxSlide {
	addText(
		text: string | { text: string; options: { bullet: { characterCode: string } } }[],
		options?: {
			x?: number;
			y?: number;
			w?: number;
			h?: number;
			fontSize?: number;
			bold?: boolean;
			color?: string;
			valign?: "top" | "middle" | "bottom";
		},
	): void;
}

interface PptxGenJSLike {
	addSlide(): PptxSlide;
	writeFile(props: { fileName: string }): Promise<string>;
}

const PptxGenJS = require("pptxgenjs") as unknown as new () => PptxGenJSLike;

export async function renderPptx(input: SlideInput): Promise<DeliveryArtifact> {
	const pptx = new PptxGenJS();
	for (const slide of input.slides) {
		const s = pptx.addSlide();
		s.addText(slide.title, {
			x: 0.5,
			y: 0.4,
			w: 9,
			h: 0.8,
			fontSize: 28,
			bold: true,
			color: "1F2937",
		});
		s.addText(
			slide.bullets.map((b) => ({ text: b, options: { bullet: { characterCode: "2022" } } })),
			{ x: 0.5, y: 1.4, w: 9, h: 5.5, fontSize: 18, color: "374151", valign: "top" },
		);
	}
	await pptx.writeFile({ fileName: input.outPath });
	const st = await stat(input.outPath);
	return {
		kind: "pptx",
		path: input.outPath,
		label: input.slides[0]?.title ?? "deck",
		bytes: st.size,
		createdAt: Date.now(),
	};
}
