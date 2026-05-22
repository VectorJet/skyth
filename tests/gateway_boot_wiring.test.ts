import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunEvent } from "@/core/events";
import { GatewayToolRuntime } from "@/base/base_agent/tools/gateway_runtime";
import { MemoryManager } from "@/base/base_agent/memory/manager";
import { PluginManager } from "@/base/base_agent/plugin/manager";
import { DelegationController } from "@/base/base_agent/delegation/controller";
import { createGatewayRuntimeServices } from "@/gateway/core/runtime";
import { MCPRegistry } from "@/gateway/registries/mcp";
import { PipelineRegistry } from "@/gateway/registries/pipelines";
import { SkillLoader, SkillRegistry } from "@/gateway/registries/skills";
import { ToolRegistry } from "@/gateway/registries/tools";
import { GatewayAgentRegistry } from "@/gateway/registries/agents";
import {
	buildGatewayAgentSession,
	buildProviderConfig,
} from "@/gateway/lifecycle/agent-session-boot";
import type { DurableStores } from "@/gateway/durable/index";
import type { DelegationServices } from "@/gateway/meta/tools/manager";
import { LLMProvider, type LLMResponse } from "@/providers/base";
import { Config } from "@/config/schema";

class StubProvider extends LLMProvider {
	async chat(): Promise<LLMResponse> {
		return { content: "ok", tool_calls: [], finish_reason: "stop" };
	}
	getDefaultModel(): string {
		return "stub/model";
	}
}

function recordingDurableStores(recorded: RunEvent[]): DurableStores {
	return {
		queue: {
			pushUser: async () => {},
			pushGateway: async () => {},
			claimAll: async () => [],
			markDone: async () => {},
			releaseInflight: async () => {},
			pendingStats: async () => ({ user: 0, gateway: 0 }),
		},
		memory: {
			recordGatewayTurn: () => {},
			buildRagHint: async () => null,
		},
		heartbeat: { append: async () => {} },
		cron: { register: async () => {} },
		stateTransitions: { record: async () => {} },
		runEvents: {
			record: (event) => {
				recorded.push(event);
			},
		},
	};
}

function fakeDelegationServices(): DelegationServices {
	return {
		subagentManager: null,
		delegationController: new DelegationController(2),
		agentRegistry: new GatewayAgentRegistry(),
	};
}

function buildToolRuntime(): GatewayToolRuntime {
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
	return new GatewayToolRuntime({
		toolRegistry,
		pipelineRegistry,
		mcpRegistry,
		skillRegistry,
		runtimeServices,
	});
}

describe("buildProviderConfig", () => {
	test("uses hydrated Config values when env is empty", () => {
		const config = new Config();
		config.primary_model_provider = "openai";
		config.primary_model = "openai/gpt-5";
		config.agents.defaults.model = "openai/gpt-5";
		(config.providers as any).openai.api_key = "quasar-openai-key";
		(config.providers as any).openai.api_base = "https://api.config";

		expect(buildProviderConfig({}, config)).toEqual({
			default_model: "openai/gpt-5",
			provider_name: "openai",
			api_key: "quasar-openai-key",
			api_base: "https://api.config",
		});
	});

	test("maps SKYTH_MODEL when set", () => {
		const config = buildProviderConfig({
			SKYTH_MODEL: "openai/gpt-5",
			SKYTH_PROVIDER: "openai",
			SKYTH_API_KEY: "sk-test",
			SKYTH_API_BASE: "https://api.test",
		});
		expect(config).toEqual({
			default_model: "openai/gpt-5",
			provider_name: "openai",
			api_key: "sk-test",
			api_base: "https://api.test",
		});
	});

	test("falls back to SKYTH_DEFAULT_MODEL when SKYTH_MODEL is unset", () => {
		const config = buildProviderConfig({
			SKYTH_DEFAULT_MODEL: "anthropic/claude-3",
		});
		expect(config.default_model).toBe("anthropic/claude-3");
		expect(config.provider_name).toBeUndefined();
		expect(config.api_key).toBeUndefined();
		expect(config.api_base).toBeUndefined();
	});

	test("returns all-undefined when env is empty", () => {
		const config = buildProviderConfig({});
		expect(config.default_model).toBeUndefined();
		expect(config.provider_name).toBeUndefined();
		expect(config.api_key).toBeUndefined();
		expect(config.api_base).toBeUndefined();
	});
});

describe("buildGatewayAgentSession", () => {
	let workspaceRoot: string;
	let originalEnv: Record<string, string | undefined>;

	beforeEach(() => {
		workspaceRoot = mkdtempSync(join(tmpdir(), "skyth-boot-"));
		originalEnv = {
			SKYTH_MODEL: process.env.SKYTH_MODEL,
			SKYTH_DEFAULT_MODEL: process.env.SKYTH_DEFAULT_MODEL,
			SKYTH_PROVIDER: process.env.SKYTH_PROVIDER,
			SKYTH_API_KEY: process.env.SKYTH_API_KEY,
			SKYTH_API_BASE: process.env.SKYTH_API_BASE,
		};
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	test("wires injected provider, runEventSink, and delegation services", async () => {
		const recorded: RunEvent[] = [];
		const durableStores = recordingDurableStores(recorded);
		const delegationServices = fakeDelegationServices();
		const provider = new StubProvider();

		const memoryManager = new MemoryManager();
		const pluginManager = new PluginManager();

		const boot = await buildGatewayAgentSession({
			durableStores,
			toolRuntime: buildToolRuntime(),
			delegationServices,
			workspaceRoot,
			provider,
			memoryManager,
			pluginManager,
		});

		expect(boot.provider).toBe(provider);
		expect(boot.memoryManager).toBe(memoryManager);
		expect(boot.pluginManager).toBe(pluginManager);
		expect(boot.agentSession.subagents).toBeDefined();
		expect(delegationServices.subagentManager).toBe(
			boot.agentSession.subagents ?? null,
		);

		const events: RunEvent[] = [];
		for await (const event of boot.agentSession.run({
			text: "hello",
			threadId: "boot:test",
		})) {
			events.push(event);
		}

		expect(events.at(-1)).toMatchObject({
			type: "run_finish",
			output: "ok",
		});
		expect(recorded.map((e) => e.type)).toEqual(events.map((e) => e.type));
	});

	test("uses environment-driven provider config when no provider is injected", async () => {
		process.env.SKYTH_MODEL = "openai/gpt-5";
		process.env.SKYTH_PROVIDER = "openai";
		process.env.SKYTH_API_KEY = "sk-env";
		process.env.SKYTH_API_BASE = "https://api.env";

		const durableStores = recordingDurableStores([]);
		const boot = await buildGatewayAgentSession({
			durableStores,
			toolRuntime: buildToolRuntime(),
			delegationServices: fakeDelegationServices(),
			workspaceRoot,
			memoryManager: new MemoryManager(),
			pluginManager: new PluginManager(),
		});

		expect(boot.provider.getDefaultModel()).toBe("openai/gpt-5");
	});

	test("creates a default MemoryManager with QuasarMemoryProvider when not supplied", async () => {
		const durableStores = recordingDurableStores([]);
		const boot = await buildGatewayAgentSession({
			durableStores,
			toolRuntime: buildToolRuntime(),
			delegationServices: fakeDelegationServices(),
			workspaceRoot,
			provider: new StubProvider(),
			pluginManager: new PluginManager(),
		});

		const schemaNames = boot.memoryManager
			.getToolSchemas()
			.map((schema) => schema.name as string);
		expect(schemaNames).toContain("memory_search");
		expect(schemaNames).toContain("memory_record");
	});
});

describe("createDurableStores fallback wiring", () => {
	const originalEnv = process.env.SKYTH_QUASAR_ADAPTERS;

	afterEach(() => {
		if (originalEnv === undefined) {
			delete process.env.SKYTH_QUASAR_ADAPTERS;
		} else {
			process.env.SKYTH_QUASAR_ADAPTERS = originalEnv;
		}
	});

	test("returns no-op adapters when Quasar adapters are disabled", async () => {
		process.env.SKYTH_QUASAR_ADAPTERS = "0";
		const { createDurableStores } = await import("@/gateway/durable/index");
		const stores = await createDurableStores();
		await expect(stores.heartbeat.append("noop")).resolves.toBeUndefined();
		await expect(
			stores.cron.register({
				schedule: "* * * * *",
				targetAgentId: "noop",
				payload: {},
			}),
		).resolves.toBeUndefined();
		await expect(
			stores.stateTransitions.record({ domain: "noop", to: "ok" }),
		).resolves.toBeUndefined();
		await expect(
			stores.runEvents.record({
				type: "warning",
				message: "boot-test",
			}),
		).resolves.toBeUndefined();
	});
});
