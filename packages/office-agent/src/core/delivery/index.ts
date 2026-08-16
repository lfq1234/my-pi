/**
 * delivery 模块统一导出（phase-1 对外接口契约）。
 *
 * 三件套生成器 + 海报合成 + 格式转换，全部返回统一 DeliveryArtifact。
 * phase-2 的 tools 直接从此处 import（相对路径）。
 */
import type { DeliveryArtifact } from "../types.ts";
import { convert, findLibreOffice } from "./convert.ts";
import { renderDocx } from "./docx.ts";
import { loadChineseFont } from "./fonts.ts";
import { compose } from "./poster.ts";
import { renderPptx } from "./pptx.ts";
import type { DocInput, DocRenderer, PosterComposer, SheetInput, SlideInput } from "./types.ts";
import { renderXlsx } from "./xlsx.ts";

export type { DeliveryArtifact, OfficeArtifactKind } from "../types.ts";
export type { ConvertTarget } from "./convert.ts";
export type {
	DocInput,
	DocRenderer,
	PosterComposer,
	PosterInput,
	SheetInput,
	SlideInput,
} from "./types.ts";

export { renderDocx, renderXlsx, renderPptx, compose, convert, findLibreOffice, loadChineseFont };

/** 三件套生成器的默认实现（聚合三个 render 函数） */
export function createDocRenderer(): DocRenderer {
	return { renderDocx, renderXlsx, renderPptx };
}

/** 海报合成器的默认实现 */
export function createPosterComposer(): PosterComposer {
	return { compose };
}

/** 便捷入口：一次生成三件套 */
export async function renderAll(inputs: {
	doc?: DocInput;
	sheet?: SheetInput;
	slide?: SlideInput;
}): Promise<DeliveryArtifact[]> {
	const results: DeliveryArtifact[] = [];
	if (inputs.doc) results.push(await renderDocx(inputs.doc));
	if (inputs.sheet) results.push(await renderXlsx(inputs.sheet));
	if (inputs.slide) results.push(await renderPptx(inputs.slide));
	return results;
}
