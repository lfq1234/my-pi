export class OfficeSessionManager {
	readonly cwd: string;

	constructor(cwd: string = process.cwd()) {
		this.cwd = cwd;
	}

	getCwd(): string {
		return this.cwd;
	}
}
