/**
 * 海报模板注册表（FR-6.2）：内置模板库，供 poster_compose 按 id 取模板。
 *
 * 模板数据与 src/core/tools/poster/templates/*.json 一一对应（JSON 为交付文件，
 * 本文件为运行时数据源；验收脚本校验两者一致防漂移）。
 * poster_compose 指定 templateId 后同一提示多次产出风格一致（AC-6.2）。
 */

/** 模板文件结构（与 delivery/poster.ts 的 PosterTemplateSpec 兼容的子集）。 */
export interface PosterTemplateFile {
	id: string;
	name: string;
	width: number;
	height: number;
	title: { fontSize: number; weight: "bold" | "normal"; color: string; marginTop: number };
	subtitle: { fontSize: number; color: string; marginTop: number };
	logo?: { position: string; size: number };
	qr?: { position: string; size: number };
}

/** 全部内置模板（与 templates/*.json 保持同步）。 */
export const POSTER_TEMPLATE_FILES: PosterTemplateFile[] = [
	{
		id: "social-promo",
		name: "社媒促销海报",
		width: 1080,
		height: 1080,
		title: { fontSize: 72, weight: "bold", color: "#E60012", marginTop: 120 },
		subtitle: { fontSize: 36, color: "#333333", marginTop: 40 },
		logo: { position: "bottom-right", size: 120 },
		qr: { position: "bottom-left", size: 160 },
	},
	{
		id: "promo-banner",
		name: "促销活动横幅",
		width: 800,
		height: 450,
		title: { fontSize: 56, weight: "bold", color: "#FFD700", marginTop: 60 },
		subtitle: { fontSize: 28, color: "#FFF5E6", marginTop: 24 },
		logo: { position: "bottom-right", size: 80 },
		qr: { position: "bottom-left", size: 100 },
	},
	{
		id: "kv-hero",
		name: "品牌主视觉",
		width: 1920,
		height: 1080,
		title: { fontSize: 96, weight: "bold", color: "#FFFFFF", marginTop: 180 },
		subtitle: { fontSize: 44, color: "#D1D5DB", marginTop: 48 },
		logo: { position: "top-left", size: 140 },
		qr: { position: "bottom-right", size: 180 },
	},
	{
		id: "activity-header",
		name: "活动头图",
		width: 1200,
		height: 500,
		title: { fontSize: 64, weight: "bold", color: "#0EA5E9", marginTop: 80 },
		subtitle: { fontSize: 30, color: "#334155", marginTop: 32 },
		logo: { position: "top-right", size: 100 },
		qr: { position: "bottom-right", size: 120 },
	},
];

const BY_ID = new Map(POSTER_TEMPLATE_FILES.map((t) => [t.id, t]));

/** 按模板 id 取模板；不存在返回 undefined。 */
export function getPosterTemplate(id: string): PosterTemplateFile | undefined {
	return BY_ID.get(id);
}
