import { createHash } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

export async function fingerprintDirectory(dir: string): Promise<string> {
	const parts: string[] = [];
	const walk = async (current: string) => {
		let entries: any[] = [];
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const fullPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				if (
					entry.name === "node_modules" ||
					entry.name === ".git" ||
					entry.name === ".gateway-reload"
				)
					continue;
				await walk(fullPath);
				continue;
			}
			if (!entry.isFile() || !/\.(ts|js|json|py|toml|txt)$/.test(entry.name))
				continue;
			try {
				const stat = await fs.stat(fullPath);
				const hash = createHash("sha256")
					.update(await fs.readFile(fullPath))
					.digest("hex");
				parts.push(
					`${path.relative(dir, fullPath)}:${stat.mtimeMs}:${stat.size}:${hash}`,
				);
			} catch {}
		}
	};
	await walk(dir);
	return parts.sort().join("|");
}
