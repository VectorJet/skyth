import type { SubagentManager } from "@/base/base_agent/delegation/manager";
import type { DelegationController } from "@/base/base_agent/delegation/controller";
import type { GatewayAgentRegistry } from "@/gateway/registries/agents";

let subagentManager: SubagentManager | null = null;
let delegationController: DelegationController | null = null;
let agentRegistry: GatewayAgentRegistry | null = null;

export function setSubagentManager(manager: SubagentManager | null): void {
	subagentManager = manager;
}

export function setDelegationController(
	controller: DelegationController,
): void {
	delegationController = controller;
}

export function setAgentRegistry(registry: GatewayAgentRegistry): void {
	agentRegistry = registry;
}

export interface DelegationServices {
	subagentManager: SubagentManager | null;
	delegationController: DelegationController;
	agentRegistry: GatewayAgentRegistry;
}

export function getServices(): DelegationServices {
	if (!delegationController) {
		throw new Error("DelegationController not initialized");
	}
	if (!agentRegistry) {
		throw new Error("GatewayAgentRegistry not initialized");
	}
	return { subagentManager, delegationController, agentRegistry };
}
