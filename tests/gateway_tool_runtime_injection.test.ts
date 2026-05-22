import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkythAgentSession } from "@/core/session/agent-session";
import { GatewayToolRuntime } from "@/base/base_agent/tools/gateway_runtime";
import { createGatewayRuntimeServices } from "@/gateway/core/runtime";
import { MCPRegistry } from "@/gateway/registries/mcp";
import { PipelineRegistry } from "@/gateway/registries/pipelines";
import { SkillLoader, SkillRegistry } from "@/gateway/registries/skills";
import { ToolRegistry } from "@/gateway/registries/tools";
import { LLMProvider, type LLMResponse } from "@/providers/base";

class ToolCallingProvider extends LLMProvider {
	calls = 0;

	async chat(params: {
		messages: Array<Record<string, unknown>>;
		tools?: Array<Record<string, unknown>>;
	}): Promise<LLMResponse> {
		this.calls += 1;
		if (this.calls === 1) {
			expect(
				params.tools?.some((tool) => tool.function?.name === "echo_test"),
			).toBe(true);
			return {
				content: "",
				tool_calls: [
					{
						id: "call_echo",
						name: "echo_test",
						arguments: { text: "runtime wired" },
					},
				],
				finish_reason: "tool_calls",
			};
		}

		const toolMessage = params.messages.find(
			(message) => message.role === "tool" && message.name === "echo_test",
		);
		expect(String(toolMessage?.content ?? "")).toContain("runtime wired");
		return {
			content: "gateway runtime executed",
			tool_calls: [],
			finish_reason: "stop",
		};
	}

	getDefaultModel(): string {
		return "test/model";
	}
}

describe("SkythAgentSession gateway tool runtime injection", () => {
	test("model loop executes gateway tools through injected runtime", async () => {
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

		const provider = new ToolCallingProvider();
		const session = new SkythAgentSession({
			provider,
			tools: new GatewayToolRuntime({
				toolRegistry,
				pipelineRegistry,
				mcpRegistry,
				skillRegistry,
				runtimeServices,
			}),
			workspace: mkdtempSync(join(tmpdir(), "skyth-session-")),
		});

		const events = [];
		for await (const event of session.run({ text: "call echo" })) {
			events.push(event);
		}

		expect(provider.calls).toBe(2);
		expect(events.some((event) => event.type === "tool_result")).toBe(true);
		expect(events.at(-1)).toMatchObject({
			type: "run_finish",
			output: "gateway runtime executed",
		});
	});

	test("meta-tools execute through the base-agent ToolExecutor", async () => {
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

		let metaToolResult: string | null = null;

		class MetaToolProvider extends LLMProvider {
			calls = 0;

			async chat(params: {
				messages: Array<Record<string, unknown>>;
				tools?: Array<Record<string, unknown>>;
			}): Promise<LLMResponse> {
				this.calls += 1;
				if (this.calls === 1) {
					expect(
						params.tools?.some(
							(tool) => tool.function?.name === "list_tools",
						),
					).toBe(true);
					return {
						content: "",
						tool_calls: [
							{
								id: "call_list",
								name: "list_tools",
								arguments: {},
							},
						],
						finish_reason: "tool_calls",
					};
				}

				const toolMessage = params.messages.find(
					(message) =>
						message.role === "tool" && message.name === "list_tools",
				);
				metaToolResult = String(toolMessage?.content ?? "");
				return {
					content: "listed tools",
					tool_calls: [],
					finish_reason: "stop",
				};
			}

			getDefaultModel(): string {
				return "test/model";
			}
		}

		const provider = new MetaToolProvider();
		const session = new SkythAgentSession({
			provider,
			tools: new GatewayToolRuntime({
				toolRegistry,
				pipelineRegistry,
				mcpRegistry,
				skillRegistry,
				runtimeServices,
			}),
			workspace: mkdtempSync(join(tmpdir(), "skyth-meta-")),
		});

		const events = [];
		for await (const event of session.run({ text: "list tools" })) {
			events.push(event);
		}

		expect(provider.calls).toBe(2);
		expect(events.some((event) => event.type === "tool_result")).toBe(true);
		expect(metaToolResult).toBeTruthy();
		expect(metaToolResult).toContain("echo_test");
		const parsed = JSON.parse(metaToolResult as string);
		expect(parsed.tools).toBeArray();
		expect(parsed.tools.some((t: Record<string, string>) => t.name === "echo_test")).toBe(true);
		expect(events.at(-1)).toMatchObject({
			type: "run_finish",
			output: "listed tools",
		});
	});
});
