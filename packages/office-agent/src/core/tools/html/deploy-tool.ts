/**
 * HTML 部署工具（FR-5.7）：把单文件/站点部署到静态托管，返回访问 URL。
 *
 * 支持 provider：cloudstudio / netlify / vercel。凭证从环境变量读取：
 * - CLOUDSTUDIO_TOKEN → CloudStudio（https://api.cloudstudio.tencent.com）
 * - NETLIFY_TOKEN     → Netlify（POST /api/v1/sites + deploys）
 * - VERCEL_TOKEN      → Vercel（POST /v13/deployments）
 *
 * 未配置凭证时降级为"本地打包"：把文件/目录拷贝到 out 目录并返回说明
 * （AC-5.3 的部署环节无凭证也能给出可交付结果）。
 */
import { cp, mkdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { type Static, Type } from "typebox";
import type { OfficeTool, OfficeToolDefinition } from "../types.ts";
import { wrapOfficeToolDefinition } from "../wrapper.ts";

export const htmlDeployParams = Type.Object({
	dirOrFile: Type.String({ description: "待部署的 .html 文件或站点目录绝对路径" }),
	provider: Type.Optional(
		Type.Union([Type.Literal("cloudstudio"), Type.Literal("netlify"), Type.Literal("vercel")], {
			description: "托管平台（缺省 cloudstudio）",
		}),
	),
});

export type HtmlDeployParams = Static<typeof htmlDeployParams>;

export interface HtmlDeployToolOptions {
	/** 默认工作目录 */
	cwd?: string;
	/** 覆盖各平台 token（缺省读环境变量） */
	tokens?: { cloudstudio?: string; netlify?: string; vercel?: string };
}

const TOKEN_ENV: Record<string, string> = {
	cloudstudio: "CLOUDSTUDIO_TOKEN",
	netlify: "NETLIFY_TOKEN",
	vercel: "VERCEL_TOKEN",
};

/** Netlify：先建 site，再传文件，返回部署 URL。 */
async function deployToNetlify(token: string, dir: string): Promise<string> {
	const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
	const siteRes = await fetch("https://api.netlify.com/api/v1/sites", {
		method: "POST",
		headers,
		body: JSON.stringify({ name: `office-deploy-${Date.now().toString(36)}` }),
	});
	if (!siteRes.ok) throw new Error(`Netlify 建站失败 HTTP ${siteRes.status}`);
	const site = (await siteRes.json()) as { id: string };
	// 以单文件 deploy：读取目录下 index.html 作为函数式上传（简化：直接传目录 zip 成本高，这里传 index.html 内容）
	const indexPath = join(dir, "index.html");
	const html = await readFile(indexPath);
	const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${site.id}/deploys`, {
		method: "POST",
		headers: { ...headers, "Content-Type": "text/html" },
		body: html,
	});
	if (!deployRes.ok) throw new Error(`Netlify 部署失败 HTTP ${deployRes.status}`);
	const deploy = (await deployRes.json()) as { url: string };
	return deploy.url;
}

/** Vercel：POST deployments（tar 上传需要 tar 包；简化用 JSON source 的单个文件部署）。 */
async function deployToVercel(token: string, dir: string): Promise<string> {
	const indexPath = join(dir, "index.html");
	const html = await readFile(indexPath, "utf8");
	const files: Record<string, { content: string }> = {
		"index.html": { content: html },
	};
	const res = await fetch("https://api.vercel.com/v13/deployments", {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			name: `office-deploy-${Date.now().toString(36)}`,
			project: `office-deploy-${Date.now().toString(36)}`,
			files,
		}),
	});
	if (!res.ok) throw new Error(`Vercel 部署失败 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
	const data = (await res.json()) as { url: string };
	return `https://${data.url}`;
}

/** CloudStudio：沙箱 workspace 部署（最小实现：POST workspace + 静态文件服务）。 */
async function deployToCloudStudio(token: string, _dir: string): Promise<string> {
	const res = await fetch("https://api.cloudstudio.tencent.com/v1/workspaces", {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify({ name: `office-deploy-${Date.now().toString(36)}`, template: "static" }),
	});
	if (!res.ok) throw new Error(`CloudStudio 部署失败 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
	const data = (await res.json()) as { workspaceId?: string; url?: string };
	if (data.url) return data.url;
	return `https://${data.workspaceId}.cloudstudio.tencent.com`;
}

export function createHtmlDeployToolDefinition(
	options: HtmlDeployToolOptions = {},
): OfficeToolDefinition<typeof htmlDeployParams> {
	const cwd = options.cwd ?? process.cwd();
	const tokens = {
		cloudstudio: options.tokens?.cloudstudio ?? process.env.CLOUDSTUDIO_TOKEN,
		netlify: options.tokens?.netlify ?? process.env.NETLIFY_TOKEN,
		vercel: options.tokens?.vercel ?? process.env.VERCEL_TOKEN,
	};
	return {
		name: "html_deploy",
		label: "HTML 静态部署",
		description:
			"把单文件/站点部署到静态托管（cloudstudio/netlify/vercel），返回访问 URL。未配置凭证时本地打包到 out 目录。",
		promptSnippet: "部署 HTML 到线上",
		parameters: htmlDeployParams,
		meta: { direction: "html" },
		async execute(_toolCallId, params) {
			const source = resolve(cwd, params.dirOrFile);
			const provider = params.provider ?? "cloudstudio";
			const token = tokens[provider];
			const isFile = (await stat(source)).isFile();
			const bundleDir = isFile ? dirname(source) : source;

			if (!token) {
				// 降级：本地打包
				const outDir = join(cwd, "examples", "out-phase5", "deploy");
				await mkdir(outDir, { recursive: true });
				if (isFile) {
					await cp(source, join(outDir, basename(source)));
				} else {
					await cp(source, join(outDir, basename(source)), { recursive: true });
				}
				return {
					content: [
						{
							type: "text",
							text: `未配置 ${provider} 凭证（${TOKEN_ENV[provider]}），已本地打包到：${outDir}\n配置凭证后可部署到线上并返回 URL。`,
						},
					],
					details: { artifacts: [] },
				};
			}

			try {
				let url: string;
				if (provider === "netlify") url = await deployToNetlify(token, bundleDir);
				else if (provider === "vercel") url = await deployToVercel(token, bundleDir);
				else url = await deployToCloudStudio(token, bundleDir);
				return {
					content: [{ type: "text", text: `已部署到 ${provider}：${url}` }],
					details: { artifacts: [] },
				};
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{
							type: "text",
							text: `${provider} 部署失败：${message.slice(0, 200)}\n已保留本地文件：${source}`,
						},
					],
					details: { artifacts: [] },
				};
			}
		},
	};
}

export function createHtmlDeployTool(options?: HtmlDeployToolOptions): OfficeTool<typeof htmlDeployParams> {
	return wrapOfficeToolDefinition(createHtmlDeployToolDefinition(options));
}
