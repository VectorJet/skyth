/**
 * Gateway agent session boot wiring.
 *
 * Builds the long-lived AISDKProvider, plugin manager, memory manager,
 * subagent bus, and SkythAgentSession used by the gateway channel runner.
 *
 * Extracted from gateway.ts so the wiring can be exercised by integration
 * tests without spinning up HTTP listeners or channel managers.
 */

import { MemoryManager, QuasarMemoryProvider } from "@/base/base_agent";
import { MessageBus } from "@/base/base_agent/bus/queue";
import { PluginManager } from "@/base/base_agent/plugin/manager";
import type { GatewayToolRuntime } from "@/base/base_agent/tools/gateway_runtime";
import { SkythAgentSession } from "@/core/session/agent-session";
import type { DurableStores } from "@/gateway/durable/index";
import type { DelegationServices } from "@/gateway/meta/tools/manager";
import { loadConfig } from "@/config/loader";
import type { Config } from "@/config/schema";
import type { LLMProvider } from "@/providers/base";
import type { AISDKProviderParams } from "@/providers/ai_sdk_provider_types";
import { AISDKProvider } from "@/providers/ai_sdk_provider";
import { loadModelsDevCatalog } from "@/pi/catalog";
import { createPiProvider } from "@/pi/factory";
export interface ProviderConfigEnv {
	SKYTH_MODEL?: string;
	SKYTH_DEFAULT_MODEL?: string;
	SKYTH_PROVIDER?: string;
	SKYTH_API_KEY?: string;
	SKYTH_API_BASE?: string;
}

export interface AgentSessionBootInput {
	durableStores: DurableStores;
	toolRuntime: GatewayToolRuntime;
	delegationServices: DelegationServices;
	workspaceRoot: string;
	env?: ProviderConfigEnv;
	config?: Config;
	provider?: LLMProvider;
	memoryManager?: MemoryManager;
	pluginManager?: PluginManager;
}

export interface AgentSessionBootResult {
	provider: LLMProvider;
	pluginManager: PluginManager;
	memoryManager: MemoryManager;
	subagentBus: MessageBus;
	agentSession: SkythAgentSession;
}

export function buildProviderConfig(
	env: ProviderConfigEnv,
	config?: Config,
): AISDKProviderParams {
	const defaultModel =
		env.SKYTH_MODEL ??
		env.SKYTH_DEFAULT_MODEL ??
		config?.primary_model ??
		config?.agents.defaults.model;
	return {
		default_model: defaultModel,
		provider_name:
			env.SKYTH_PROVIDER ??
			(defaultModel ? config?.getProviderName(defaultModel) : undefined) ??
			config?.primary_model_provider,
		api_key:
			env.SKYTH_API_KEY ??
			(defaultModel ? config?.getApiKey(defaultModel) : undefined),
		api_base:
			env.SKYTH_API_BASE ??
			(defaultModel ? config?.getApiBase(defaultModel) : undefined),
	};
}

export async function buildGatewayAgentSession(
	input: AgentSessionBootInput,
): Promise<AgentSessionBootResult> {
	const env = input.env ?? (process.env as ProviderConfigEnv);
	const config = input.config ?? (input.env ? undefined : loadConfig());
	if (!input.provider && !input.env) {
		try {
			const catalog = await loadModelsDevCatalog();
			console.log(
				`[provider] loaded model catalog (${Object.keys(catalog).length} providers)`,
			);
		} catch (error) {
			console.warn("[provider] model catalog load failed:", error);
		}
	}
	const providerConfig = buildProviderConfig(env, config);
	let provider = input.provider;
	if (!provider) {
		if (config?.runtime?.useProvider === "pi") {
			provider = createPiProvider({
				modelOverride: providerConfig.default_model,
				providerOverride: providerConfig.provider_name,
				apiKey: providerConfig.api_key,
				apiBase: providerConfig.api_base,
			});
		} else {
			provider = new AISDKProvider(providerConfig);
		}
	}
	if (!input.provider) {
		console.log("[provider] configured", {
			provider: providerConfig.provider_name ?? null,
			model: providerConfig.default_model ?? null,
			apiBase: providerConfig.api_base ?? null,
			apiKeyConfigured: Boolean(providerConfig.api_key),
		});
	}

	const pluginManager =
		input.pluginManager ??
		new PluginManager({
			onWarning: (message, details) =>
				console.warn("[plugins]", message, details ?? ""),
		});
	await pluginManager.initAll({
		agentId: "generalist",
		workspace: input.workspaceRoot,
		surface: "gateway",
	});

	const memoryManager =
		input.memoryManager ??
		(() => {
			const manager = new MemoryManager({
				onWarning: (message, details) =>
					console.warn("[memory]", message, details ?? ""),
			});
			manager.addProvider(new QuasarMemoryProvider());
			return manager;
		})();

	const subagentBus = new MessageBus();
	const agentSession = new SkythAgentSession({
		provider,
		tools: input.toolRuntime,
		workspace: input.workspaceRoot,
		delegationServices: input.delegationServices,
		pluginManager,
		memoryManager,
		runEventSink: input.durableStores.runEvents,
		bus: subagentBus,
	});

	return { provider, pluginManager, memoryManager, subagentBus, agentSession };
}
