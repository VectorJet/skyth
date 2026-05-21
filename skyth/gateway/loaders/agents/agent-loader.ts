import * as fs from "fs/promises";
import * as path from "path";
import type { HookManager } from "@/gateway/hooks/index.ts";
import type {
	LoadCandidate,
	LoadSource,
} from "@/gateway/core/contracts/index.ts";

export interface AgentDefinition {
	name: string;
	description: string;
	path: string;
	body: string;
}

export class AgentSourceLoader {
	constructor(
		private sources: LoadSource[] = [],
		private hooks?: HookManager,
	) {}

	async loadAll(): Promise<AgentDefinition[]> {
		const agents: AgentDefinition[] = [];
		for (const source of this.sources.filter((item) =>
			item.capabilities.includes("agent"),
		)) {
			let entries: any[] = [];
			try {
				entries = await fs.readdir(source.root, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const entry of entries) {
				if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
				const filePath = path.join(source.root, entry.name);
				const name = path.basename(entry.name, ".md");
				const manifestPath = path.join(source.root, `${name}.manifest.json`);
				const body = await fs.readFile(filePath, "utf8");
				const description =
					body
						.split("\n")
						.find((line) => line.trim() && !line.startsWith("#"))
						?.trim() || `Agent ${name}`;
				const candidate: LoadCandidate = {
					kind: "agent",
					name,
					source,
					root: source.root,
					manifestPath,
					entryPath: filePath,
					files: [entry.name, `${name}.manifest.json`],
					metadata: { description },
				};
				await this.hooks?.run(candidate);
				agents.push({ name, description, path: filePath, body });
			}
		}
		return agents;
	}
}
