/**
 * 扩展执行器（doc/modules/extensions.md §4）。
 *
 * runOfficeExtensions：顺序执行工厂，收集工具/提示/命令，失败不阻塞。
 * loadOfficeExtensionsFromDir：从目录动态 import *.js/*.mjs 扩展文件。
 */
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
	ExtensionRegistration,
	OfficeExtensionAPI,
	OfficeExtensionFactory,
	OfficeInlineExtension,
} from "./types.ts";

/** 创建扩展 API（注册结果写入 registration）。 */
function createExtensionApi(reg: ExtensionRegistration): OfficeExtensionAPI {
	return {
		registerTool(tool) {
			if (reg.tools.some((t) => t.name === tool.name)) {
				reg.errors.push({ name: tool.name, error: `重复注册工具 ${tool.name}` });
				return;
			}
			reg.tools.push(tool);
		},
		registerPromptSnippet(_name, snippet) {
			reg.promptSnippets.push(snippet);
		},
		registerCommand(name, handler) {
			if (reg.commands.has(name)) {
				reg.errors.push({ name, error: `重复注册命令 ${name}` });
				return;
			}
			reg.commands.set(name, handler);
		},
	};
}

/** 执行一批内联扩展，返回汇总注册结果。 */
export async function runOfficeExtensions(extensions: OfficeInlineExtension[]): Promise<ExtensionRegistration> {
	const reg: ExtensionRegistration = { tools: [], promptSnippets: [], commands: new Map(), errors: [] };
	const pi = createExtensionApi(reg);
	for (const ext of extensions) {
		const factory: OfficeExtensionFactory = typeof ext === "function" ? ext : ext.factory;
		const name = typeof ext === "function" ? "<inline>" : ext.name;
		try {
			await factory(pi);
		} catch (error: unknown) {
			reg.errors.push({ name, error: error instanceof Error ? error.message : String(error) });
		}
	}
	return reg;
}

/**
 * 从目录加载扩展文件（*.js / *.mjs），动态 import。
 * 文件导出可以是 OfficeExtensionFactory、{ default: factory } 或 factory 数组。
 */
export async function loadOfficeExtensionsFromDir(dir: string): Promise<OfficeInlineExtension[]> {
	const absDir = resolve(dir);
	let entries: string[];
	try {
		entries = await readdir(absDir);
	} catch {
		return [];
	}
	const files = entries.filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));
	const loaded: OfficeInlineExtension[] = [];
	for (const file of files) {
		try {
			const mod = (await import(pathToFileURL(join(absDir, file)).href)) as Record<string, unknown>;
			const exported = mod.default ?? mod;
			if (typeof exported === "function") {
				loaded.push(exported as OfficeExtensionFactory);
			} else if (Array.isArray(exported)) {
				loaded.push(...(exported as OfficeExtensionFactory[]));
			}
		} catch {
			// 单个扩展文件失败不阻塞整体加载（doc §6：坏文件只报错不阻塞）
		}
	}
	return loaded;
}
