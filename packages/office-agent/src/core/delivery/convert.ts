/**
 * 文档格式互转（FR-1.4，底层 `libreoffice --headless`）。
 *
 * 支持：docx→pdf / xlsx→csv / pptx→pdf 等 LibreOffice 能识别的转换。
 * Windows 下探测 soffice.exe 常见安装路径；通过 `-env:UserInstallation`
 * 隔离 profile，避免并发转换时的锁冲突。
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export type ConvertTarget = "pdf" | "csv" | "png";

/** LibreOffice 可执行文件候选（Windows 常见路径 + PATH 中的 soffice/libreoffice） */
function candidates(): string[] {
	const env = process.env.LIBREOFFICE_PATH;
	const list: string[] = [];
	if (env) list.push(env);
	if (process.platform === "win32") {
		const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
		const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
		list.push(
			join(programFiles, "LibreOffice", "program", "soffice.exe"),
			join(programFilesX86, "LibreOffice", "program", "soffice.exe"),
		);
	} else {
		list.push(
			"/usr/bin/soffice",
			"/usr/local/bin/soffice",
			"/usr/bin/libreoffice",
			"/opt/libreoffice/program/soffice",
		);
	}
	return list;
}

/** 找到可用的 soffice 可执行文件；找不到返回 null */
export function findLibreOffice(): string | null {
	for (const cand of candidates()) {
		if (existsSync(cand)) return cand;
	}
	// PATH 里是否有 soffice / libreoffice（Linux/macOS 常见）
	const path = process.env.PATH ?? "";
	for (const name of ["soffice", "libreoffice"]) {
		for (const dir of path.split(";").concat(path.split(":"))) {
			if (!dir) continue;
			const exe = join(dir, process.platform === "win32" ? `${name}.exe` : name);
			if (existsSync(exe)) return exe;
		}
	}
	return null;
}

/**
 * 转换文档格式。输出到源文件同目录，文件名替换扩展名（如 test.docx → test.pdf）。
 * 返回输出文件的绝对路径。
 */
export function convert(src: string, targetExt: ConvertTarget): Promise<string> {
	const bin = findLibreOffice();
	if (!bin) {
		return Promise.reject(
			new Error(
				"未找到 LibreOffice。请安装 LibreOffice（https://www.libreoffice.org/）或设置 LIBREOFFICE_PATH 指向 soffice 可执行文件。",
			),
		);
	}
	const out = src.replace(/\.[^.]+$/, `.${targetExt}`);
	const outDir = dirname(src);
	// 每个转换用独立 UserInstallation，避免并发锁冲突
	const profileDir = join(tmpdir(), `office-delivery-lo-${randomUUID()}`);
	const userInstallation = pathToFileURL(profileDir).href;

	return new Promise((resolve, reject) => {
		const args = [
			"--headless",
			`-env:UserInstallation=${userInstallation}`,
			"--convert-to",
			targetExt,
			"--outdir",
			outDir,
			src,
		];
		const child = spawn(bin, args, { stdio: "pipe", windowsHide: true });
		let stderr = "";
		child.stderr.on("data", (d: Buffer) => {
			stderr += d.toString();
		});
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error(`LibreOffice 转换超时: ${src} → ${targetExt}`));
		}, 120_000);
		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on("exit", (code) => {
			clearTimeout(timer);
			if (code === 0 && existsSync(out)) {
				resolve(out);
			} else {
				reject(
					new Error(
						`LibreOffice 转换失败 (exit ${code ?? "?"}): ${src} → ${targetExt}${stderr ? `\n${stderr}` : ""}`,
					),
				);
			}
		});
	});
}
