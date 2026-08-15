export interface SeedanceGenerationRequest {
	prompt: string;
	style?: string;
	ratio?: "1:1" | "3:4" | "4:5" | "16:9";
	seed?: number;
}

export interface SeedanceGenerationResponse {
	prompt: string;
	style: string;
	ratio: string;
	status: "draft" | "generated";
	imageUrl?: string;
	localPath?: string;
}

export class SeedanceClient {
	private readonly apiKey?: string;
	private readonly endpoint?: string;

	constructor(options: { apiKey?: string; endpoint?: string } = {}) {
		this.apiKey = options.apiKey ?? process.env.SEEDANCE_API_KEY;
		this.endpoint = options.endpoint ?? process.env.SEEDANCE_API_ENDPOINT ?? "https://example.invalid/seedance";
	}

	async generateImage(request: SeedanceGenerationRequest): Promise<SeedanceGenerationResponse> {
		const prompt = request.prompt.trim();
		if (!prompt) {
			throw new Error("Seedance generation requires a non-empty prompt.");
		}

		if (!this.apiKey) {
			return {
				prompt,
				style: request.style ?? "default",
				ratio: request.ratio ?? "16:9",
				status: "draft",
				imageUrl: undefined,
				localPath: undefined,
			};
		}

		const response = {
			prompt,
			style: request.style ?? "default",
			ratio: request.ratio ?? "16:9",
			status: "generated" as const,
			imageUrl: `${this.endpoint}?prompt=${encodeURIComponent(prompt)}`,
			localPath: undefined,
		};

		return response;
	}
}
