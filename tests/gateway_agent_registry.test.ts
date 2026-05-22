import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { GatewayAgentRegistry } from "@/gateway/registries/agents";

describe("GatewayAgentRegistry", () => {
	test("discovers built-in, user, and nested subagents", () => {
		const root = mkdtempSync(join(tmpdir(), "skyth-agent-registry-"));
		const userRoot = join(root, "user-agents");

		writeAgentManifest(
			join(root, "skyth", "agents", "generalist_agent"),
			"generalist",
		);
		writeAgentManifest(
			join(
				root,
				"skyth",
				"agents",
				"generalist_agent",
				"subagents",
				"debug_agent",
			),
			"debug",
		);
		writeAgentManifest(join(userRoot, "research_agent"), "research");

		const registry = new GatewayAgentRegistry();
		registry.discover({ workspaceRoot: root, userRoot });

		expect(registry.ids).toEqual(["debug", "generalist", "research"]);
		expect(registry.getAgent("generalist")?.source).toBe("builtin");
		expect(registry.getAgent("research")?.source).toBe("user");
		expect(registry.getAgent("debug")?.parentAgentId).toBe("generalist");
	});
});

function writeAgentManifest(dir: string, id: string): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "agent_manifest.json"),
		JSON.stringify(
			{
				id,
				name: id,
				version: "1.0.0",
				entrypoint: "agent.ts",
				capabilities: [],
				dependencies: [],
				security: {},
			},
			null,
			2,
		),
	);
}
