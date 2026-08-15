import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function makeId(prefix: string): string {
	return `${prefix}-${randomUUID()}`;
}

export function nowIso(): string {
	return new Date().toISOString();
}

export async function ensureDir(path: string): Promise<void> {
	await mkdir(path, { recursive: true });
}

export async function writeTextFile(path: string, content: string): Promise<void> {
	await ensureDir(dirname(path));
	await writeFile(path, content, "utf8");
}

export async function readTextFile(path: string): Promise<string> {
	return await readFile(path, "utf8");
}

export function normalizeOutputDirectory(baseDir: string, subDir: string): string {
	return resolve(baseDir, subDir);
}
