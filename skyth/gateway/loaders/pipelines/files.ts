import * as fs from "fs/promises";
import * as path from "path";

export async function listPipelineCandidateFiles(
	pipelineDir: string,
): Promise<string[]> {
	const files: string[] = [];
	async function walk(current: string): Promise<void> {
		let entries: any[] = [];
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const fullPath = path.join(current, entry.name);
			const rel = path.relative(pipelineDir, fullPath).replace(/\\/g, "/");
			if (entry.isDirectory()) {
				if (
					entry.name === "node_modules" ||
					entry.name === ".git" ||
					entry.name === ".gateway-reload"
				)
					continue;
				await walk(fullPath);
			} else if (entry.isFile()) {
				files.push(rel);
			}
		}
	}
	await walk(pipelineDir);
	return files.sort();
}
