import { glob } from "glob";

export const Glob = {
	async scan(pattern: string, options?: any): Promise<string[]> {
		return await glob(pattern, options);
	},
	scanSync(pattern: string, options?: any): string[] {
		return glob.sync(pattern, options);
	},
};
