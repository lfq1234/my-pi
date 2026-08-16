/**
 * 海报文字层合成（FR-1.5，关键决策：中文本地合成）。
 *
 * 链路：satori-html 把 HTML 字符串解析为 VNode → satori 排版成 SVG（加载中文字体）
 * → sharp 渲染 SVG 为 PNG 文字层 → 叠加 logo/qr → 合成到背景图 → 可选转 PDF。
 *
 * 背景图缺省时输出纯文字层海报（白底），phase-5 接入即梦后传 backgroundImage。
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import satori from "satori";
import { html } from "satori-html";
import sharp from "sharp";
import type { DeliveryArtifact } from "../types.ts";
import { loadChineseFont } from "./fonts.ts";
import { pngToPdf } from "./pdf.ts";
import type { PosterInput } from "./types.ts";

/** 转义 HTML 文本，防止标题/副标题中的特殊字符破坏布局或注入 */
function esc(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

/** 确保输出目录存在 */
async function ensureOutDir(outPath: string): Promise<void> {
	const dir = dirname(outPath);
	if (!dir || dir === ".") return;
	try {
		await stat(dir);
	} catch {
		await mkdir(dir, { recursive: true });
	}
}

export async function compose(input: PosterInput): Promise<DeliveryArtifact> {
	const font = await loadChineseFont();
	const { width, height } = input;
	const hasBg = input.backgroundImage !== undefined;
	// 有背景图 → 白字（覆盖在图片上）；纯文字层 → 深字（白底海报）
	const titleColor = hasBg ? "#ffffff" : "#111827";
	const subtitleColor = hasBg ? "#e5e7eb" : "#4b5563";

	const titleEl = input.title
		? `<div style="font-size:64px;font-weight:700;color:${titleColor};margin:0 48px 16px;line-height:1.2;">${esc(input.title)}</div>`
		: "";
	const subtitleEl = input.subtitle
		? `<div style="font-size:32px;color:${subtitleColor};margin:0 64px;line-height:1.4;">${esc(input.subtitle)}</div>`
		: "";

	// satori-html 把 HTML 字符串解析为 VNode；再交给 satori 渲染成 SVG
	const markup = html(`
    <div style="width:${width}px;height:${height}px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-family:${font.name};">
      ${titleEl}
      ${subtitleEl}
    </div>
  `);
	const svg = await satori(markup, {
		width,
		height,
		fonts: [font],
	});

	// 文字层 SVG → PNG
	let textLayer = await sharp(Buffer.from(svg)).png().toBuffer();

	// 叠加 logo（左上）/ 二维码（右下），带边距
	const overlays: { input: Buffer; left?: number; top?: number; right?: number; bottom?: number }[] = [];
	if (input.logoPath) {
		const logo = await readFile(input.logoPath);
		const meta = await sharp(logo).metadata();
		const w = Math.min(meta.width ?? 0, Math.floor(width * 0.18));
		const h = Math.round((w * (meta.height ?? 1)) / Math.max(1, meta.width ?? 1));
		overlays.push({ input: await sharp(logo).resize(w, h).png().toBuffer(), left: 24, top: 24 });
	}
	if (input.qrPath) {
		const qr = await readFile(input.qrPath);
		const meta = await sharp(qr).metadata();
		const size = Math.min(meta.width ?? 0, Math.floor(width * 0.22));
		overlays.push({
			input: await sharp(qr).resize(size, size).png().toBuffer(),
			right: 24,
			bottom: 24,
		});
	}
	if (overlays.length > 0) {
		textLayer = await sharp(textLayer).composite(overlays).png().toBuffer();
	}

	// 合成到背景图（缺省时文字层即最终结果）
	const base = hasBg
		? await sharp(input.backgroundImage)
				.resize(width, height, { fit: "cover" })
				.composite([{ input: textLayer }])
				.png()
				.toBuffer()
		: textLayer;

	const out = input.outKind === "pdf" ? await pngToPdf(base) : base;
	await ensureOutDir(input.outPath);
	await writeFile(input.outPath, out);
	return {
		kind: input.outKind,
		path: input.outPath,
		label: input.title ?? "poster",
		bytes: out.length,
		createdAt: Date.now(),
	};
}
