import { describe, expect, test } from "bun:test";
import { GatewayToolRuntime } from "@/base/base_agent/tools/gateway_runtime";
import { createGatewayRuntimeServices } from "@/gateway/core/runtime";
import { MCPRegistry } from "@/gateway/registries/mcp";
import { PipelineRegistry } from "@/gateway/registries/pipelines";
import { SkillLoader, SkillRegistry } from "@/gateway/registries/skills";
import { ToolRegistry } from "@/gateway/registries/tools";

describe("GatewayToolRuntime", () => {
	test("exposes and executes gateway registered tools", async () => {
		const toolRegistry = new ToolRegistry({
			allowOverride: true,
			validateSchemas: true,
		});
		const pipelineRegistry = new PipelineRegistry();
		const mcpRegistry = new MCPRegistry({
			mcpDirectories: [],
			autoReload: false,
		});
		const skillRegistry = new SkillRegistry(new SkillLoader(), {
			allowOverride: true,
		});
		const runtimeServices = createGatewayRuntimeServices({
			toolRegistry,
			pipelineRegistry,
			mcpRegistry,
			skillRegistry,
		});
		runtimeServices.watchers.stop();

		toolRegistry.register(
			{
				name: "echo_test",
				description: "Echo test input",
				parameters: [
					{
						name: "text",
						description: "Text to echo",
						type: "string",
						required: true,
					},
				],
				handler: async (args) => ({ echoed: args.text }),
			},
			"custom",
		);

		const runtime = new GatewayToolRuntime({
			toolRegistry,
			pipelineRegistry,
			mcpRegistry,
			skillRegistry,
			runtimeServices,
		});

		const definitions = runtime.getDefinitions();
		expect(
			definitions.some(
				(definition: any) => definition.function?.name === "echo_test",
			),
		).toBe(true);
		expect(
			definitions.some(
				(definition: any) => definition.function?.name === "find_tools",
			),
		).toBe(true);

		await expect(runtime.execute("echo_test", { text: "ok" })).resolves.toEqual(
			{
				echoed: "ok",
			},
		);
	});
});
