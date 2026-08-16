export class OfficeAgentSettingsManager {
	readonly cwd: string;

	constructor(cwd: string = process.cwd()) {
		this.cwd = cwd;
	}

	getWorkspaceRoot(): string {
		return this.cwd;
	}
}
