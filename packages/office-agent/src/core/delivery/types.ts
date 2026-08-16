/**
 * delivery 模块入参契约（phase-1 §2 的 DocInput / SheetInput / SlideInput / PosterInput）。
 *
 * 生成器只关心"输入结构 → DeliveryArtifact"，不关心 LLM 怎么决策。
 */
import type { DeliveryArtifact } from "../types.ts";

/** docx 生成入参 */
export interface DocInput {
	title: string;
	sections: { heading: string; body: string }[];
	outPath: string;
}

/** xlsx 生成入参 */
export interface SheetInput {
	sheets: { name: string; rows: (string | number)[][] }[];
	outPath: string;
}

/** pptx 生成入参 */
export interface SlideInput {
	slides: { title: string; bullets: string[] }[];
	outPath: string;
}

/** 海报合成入参 */
export interface PosterInput {
	/** 文生图层（phase-5 接入即梦）；缺省时仅输出文字层 */
	backgroundImage?: Buffer;
	width: number;
	height: number;
	title?: string;
	subtitle?: string;
	logoPath?: string;
	qrPath?: string;
	/** 模板 id（phase-6） */
	template?: string;
	outPath: string;
	outKind: "png" | "pdf";
}

/** 三件套生成器（返回一个 Artifact，不关心 LLM 怎么决策） */
export interface DocRenderer {
	renderDocx(input: DocInput): Promise<DeliveryArtifact>;
	renderXlsx(input: SheetInput): Promise<DeliveryArtifact>;
	renderPptx(input: SlideInput): Promise<DeliveryArtifact>;
}

/** 海报合成器（输出 png/pdf） */
export interface PosterComposer {
	compose(input: PosterInput): Promise<DeliveryArtifact>;
}
