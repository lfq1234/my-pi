export async function extractPdfText(buffer: Buffer): Promise<string> {
	const raw = buffer.toString("latin1");

	const textTokens = Array.from(raw.matchAll(/\((?:\\.|[^()\\])*\)/g))
		.map((match) => decodePdfText(match[0]))
		.filter((value) => value && value.trim().length > 0);

	const streamText = Array.from(raw.matchAll(/BT[\s\S]*?ET/g))
		.map((match) => match[0])
		.flatMap((block) => Array.from(block.matchAll(/\((?:\\.|[^()\\])*\)/g)))
		.map((match) => decodePdfText(match[0]))
		.filter((value) => value && value.trim().length > 0);

	const candidates = [...textTokens, ...streamText];

	const unique = candidates.filter((value, index, array) => {
		const normalized = value.replace(/\s+/g, " ").trim();
		return (
			normalized.length > 0 && array.findIndex((item) => item.replace(/\s+/g, " ").trim() === normalized) === index
		);
	});

	const combined = unique.join(" ").replace(/\s+/g, " ").trim();

	if (combined) {
		return combined;
	}

	return `PDF text could not be extracted automatically. File size: ${buffer.length} bytes.`;
}

function decodePdfText(value: string): string {
	let decoded = value.slice(1, -1);
	decoded = decoded.replace(/\\([\\()])/g, "$1");
	decoded = decoded.replace(/\\n/g, "\n");
	decoded = decoded.replace(/\\r/g, "\r");
	decoded = decoded.replace(/\\t/g, "\t");
	decoded = decoded.replace(/\\b/g, "\b");
	decoded = decoded.replace(/\\f/g, "\f");
	decoded = decoded.replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
	decoded = decoded.replace(/\\\((?=[^)]|$)/g, "(");
	decoded = decoded.replace(/\\\)/g, ")");
	decoded = decoded.replace(/\\\n/g, "");
	decoded = decoded.replace(/\s+/g, " ").trim();

	return decoded.replace(/\u0000/g, "");
}
