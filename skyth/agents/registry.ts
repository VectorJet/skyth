import { readFileSync } from "node:fs";
import { ManifestRegistry } from "@/base/base_agent/manifest/registry";
import { GatewayAgentRegistry } from "@/gateway/registries/agents";

export class AgentRegistry extends ManifestRegistry<unknown> {
	constructor() {
		super("agents");
	}

	discoverAgents(workspaceRoot: string, externalPaths: string[] = []): void {
		const gateway = new GatewayAgentRegistry();
		gateway.discover({ workspaceRoot, externalPaths });
		for (const agent of gateway.getAllAgents().values()) {
			this.register(
				{
					manifest: agent.manifest,
					root: agent.root,
					manifestPath: agent.manifestPath,
					internal: agent.source === "builtin",
				},
				agent.source === "builtin",
			);
		}
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
