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
import type { AISDKProviderParams } from "@/providers/ai_sdk_provider_types";
import { AISDKProvider } from "@/providers/ai_sdk_provider";

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
	provider?: AISDKProvider;
	memoryManager?: MemoryManager;
	pluginManager?: PluginManager;
}

export interface AgentSessionBootResult {
	provider: AISDKProvider;
	pluginManager: PluginManager;
	memoryManager: MemoryManager;
	subagentBus: MessageBus;
	agentSession: SkythAgentSession;
}

export function buildProviderConfig(
	env: ProviderConfigEnv,
): AISDKProviderParams {
	return {
		default_model: env.SKYTH_MODEL ?? env.SKYTH_DEFAULT_MODEL,
		provider_name: env.SKYTH_PROVIDER,
		api_key: env.SKYTH_API_KEY,
		api_base: env.SKYTH_API_BASE,
	};
}

export async function buildGatewayAgentSession(
	input: AgentSessionBootInput,
): Promise<AgentSessionBootResult> {
	const env = input.env ?? (process.env as ProviderConfigEnv);
	const provider =
		input.provider ?? new AISDKProvider(buildProviderConfig(env));

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
