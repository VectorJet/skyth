import { join } from "node:path";
import { readFileSync } from "node:fs";
import { ManifestRegistry } from "@/core/registry";

export class AgentRegistry extends ManifestRegistry<unknown> {
	constructor() {
		super("agents");
	}

	discoverAgents(workspaceRoot: string, externalPaths: string[] = []): void {
		this.discover(
			[join(workspaceRoot, "skyth", "agents")],
			externalPaths,
			"agent_manifest.json",
		);
	}

	globalToolsEnabled(agentId: string): boolean {
		const entry = this.get(agentId);
		if (!entry) return false;
		try {
			const raw = JSON.parse(
				readFileSync(entry.manifestPath, "utf-8"),
			) as Record<string, unknown>;
			return Boolean(raw.global_tools === true);
		} catch {
			return false;
		}
	}
}
