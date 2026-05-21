import * as fs from "fs/promises";
import * as path from "path";
import chalk from "chalk";

export async function scanToolDirectories(
	toolsDirectory: string,
): Promise<Map<string, string>> {
	const toolsMap = new Map<string, string>();
	try {
		const entries = await fs.readdir(toolsDirectory, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const toolPath = path.join(toolsDirectory, entry.name);
			const manifestPath = path.join(toolPath, "manifest.json");
			try {
				await fs.access(manifestPath);
				toolsMap.set(entry.name, toolPath);
			} catch {}
		}
	} catch (error) {
		console.error(chalk.red(`Failed to scan tools directory: ${error}`));
	}
	return toolsMap;
}

export async function listCandidateFiles(root: string): Promise<string[]> {
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
			const rel = path.relative(root, fullPath).replace(/\\/g, "/");
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
	await walk(root);
	return files.sort();
}
