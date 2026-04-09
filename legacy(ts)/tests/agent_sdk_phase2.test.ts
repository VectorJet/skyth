import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineAgent } from "../skyth/sdks/agent-sdk/define";
import { defineTool } from "../skyth/sdks/agent-sdk/tools";
import { definePipeline } from "../skyth/sdks/agent-sdk/pipeline";
import { agentManifestFromObject } from "../skyth/sdks/agent-sdk/manifest";
import { resolvePermissions } from "../skyth/sdks/agent-sdk/permissions";

class FakeProvider {
	getDefaultModel() {
		return "fake:model";
	}
	async chat() {
		return { content: "ok", tool_calls: [] as any[] };
	}
}

describe("agent sdk phase2", () => {
	test("defineTool validates required fields", async () => {
		const tool = defineTool({
			name: "echo_tool",
			description: "Echo params",
			execute: async (params) => JSON.stringify(params),
		});
		const out = await tool.execute({ x: 1 });
		expect(out).toContain("x");
	});

	test("definePipeline validates steps", () => {
		const pipeline = definePipeline({
			name: "basic",
			steps: [{ tool: "echo_tool" }],
		});
		expect(pipeline.steps.length).toBe(1);
	});

	test("manifest + permissions honors global_tools", () => {
		const manifest = agentManifestFromObject({
			id: "code_agent",
			name: "Code Agent",
			version: "1.0.0",
			entrypoint: "skyth/agents/code_agent/index.ts",
			capabilities: ["code"],
			dependencies: [],
			security: {},
			global_tools: true,
		});
		const perms = resolvePermissions(manifest);
		expect(perms.globalToolsEnabled).toBeTrue();
		expect(perms.delegationRequiredForGlobals).toBeFalse();
	});

	test("defineAgent creates lifecycle runtime", () => {
		const dir = mkdtempSync(join(tmpdir(), "skyth-sdk-"));
		const manifestPath = join(dir, "agent_manifest.json");
		writeFileSync(
			manifestPath,
			JSON.stringify({
				id: "sdk_test_agent",
				name: "SDK Test Agent",
				version: "1.0.0",
				entrypoint: "skyth/agents/sdk_test_agent/index.ts",
				capabilities: ["chat"],
				dependencies: [],
				security: {},
				global_tools: false,
			}),
			"utf-8",
		);

		const factory = defineAgent({ manifest: manifestPath });
		const lifecycle = factory.create({
			bus: {
				publishInbound: async () => undefined,
				publishOutbound: async () => undefined,
				onInbound: () => undefined,
				onOutbound: () => undefined,
			} as any,
			provider: new FakeProvider() as any,
			workspace: dir,
		});

		expect(typeof lifecycle.processMessage).toBe("function");
	});
});
