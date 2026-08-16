/**
 * docx 生成（FR-1.1，底层 `docx` npm）。
 */

import { writeFile } from "node:fs/promises";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { DeliveryArtifact } from "../types.ts";
import type { DocInput } from "./types.ts";

export async function renderDocx(input: DocInput): Promise<DeliveryArtifact> {
	const doc = new Document({
		sections: [
			{
				children: [
					new Paragraph({ text: input.title, heading: HeadingLevel.TITLE }),
					...input.sections.flatMap((s) => [
						new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 }),
						new Paragraph({ children: [new TextRun(s.body)] }),
					]),
				],
			},
		],
	});
	const buf = await Packer.toBuffer(doc);
	await writeFile(input.outPath, buf);
	return {
		kind: "docx",
		path: input.outPath,
		label: input.title,
		bytes: buf.length,
		createdAt: Date.now(),
	};
}
