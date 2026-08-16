/**
 * 中文字体探测（FR-1.5 关键：satori 排版必须加载真实中文字体，否则乱码）。
 *
 * 探测顺序：环境变量 OFFICE_DELIVERY_FONT > 平台常见中文字体路径。
 * 字体文件随运行环境提供（Windows 自带 simhei/msyh/simsun；CI/容器需预装）。
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface LoadedFont {
	/** satori fonts 数组里的 name，CSS font-family 需与之匹配 */
	name: string;
	/** 字体文件绝对路径（调试/日志用） */
	path: string;
	data: Buffer;
	/** satori 的 FontOptions.weight 是 100|200|…|900 联合类型 */
	weight: 400;
	style: "normal";
}

const WINDOWS_CANDIDATES: { name: string; path: string }[] = [
	{ name: "SimHei", path: join(process.env.WINDIR ?? "C:\\Windows", "Fonts", "simhei.ttf") },
	{ name: "Microsoft YaHei", path: join(process.env.WINDIR ?? "C:\\Windows", "Fonts", "msyh.ttc") },
	{ name: "SimSun", path: join(process.env.WINDIR ?? "C:\\Windows", "Fonts", "simsun.ttc") },
];

const MACOS_CANDIDATES: { name: string; path: string }[] = [
	{ name: "PingFang SC", path: "/System/Library/Fonts/PingFang.ttc" },
	{ name: "Hiragino Sans GB", path: "/System/Library/Fonts/Hiragino Sans GB.ttc" },
	{ name: "STHeiti", path: "/System/Library/Fonts/STHeiti Light.ttc" },
];

const LINUX_CANDIDATES: { name: string; path: string }[] = [
	{ name: "Noto Sans CJK SC", path: "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc" },
	{ name: "Noto Sans CJK SC", path: "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc" },
	{ name: "WenQuanYi Zen Hei", path: "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc" },
];

function candidates(): { name: string; path: string }[] {
	const env = process.env.OFFICE_DELIVERY_FONT;
	if (env) {
		return [{ name: "EnvFont", path: env }];
	}
	switch (process.platform) {
		case "win32":
			return WINDOWS_CANDIDATES;
		case "darwin":
			return MACOS_CANDIDATES;
		default:
			return LINUX_CANDIDATES;
	}
}

export async function loadChineseFont(): Promise<LoadedFont> {
	for (const cand of candidates()) {
		if (!existsSync(cand.path)) continue;
		const data = await readFile(cand.path);
		return { name: cand.name, path: cand.path, data, weight: 400, style: "normal" };
	}
	throw new Error(
		"未找到中文字体。请设置 OFFICE_DELIVERY_FONT 指向一个 .ttf/.ttc/.otf 文件（海报合成必须加载中文字体）。",
	);
}
