export class OfficeAgentResourceLoader {
	readonly cwd: string;

	constructor(cwd: string = process.cwd()) {
		this.cwd = cwd;
	}

	async reload(): Promise<void> {
		// Phase 0 intentionally leaves resource loading as a placeholder.
		return;
	}
}
