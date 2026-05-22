import type { RunEvent } from "@/core/events";
import {
	AgentRunOrchestrator,
	type AgentRunOrchestratorOptions,
} from "@/base/base_agent/runtime/orchestrator";
import type { AgentInput, RunOptions } from "@/base/base_agent/runtime/types";
import { MessageBus } from "@/base/base_agent/bus/queue";
import { SubagentManager } from "@/base/base_agent/delegation/manager";
import {
	setSubagentManager,
	type DelegationServices,
} from "@/gateway/meta/tools/delegation_bridge";

export interface AgentSession {
	run(input: AgentInput, options?: RunOptions): AsyncIterable<RunEvent>;
}

export interface SkythAgentSessionOptions extends AgentRunOrchestratorOptions {
	workspace?: string;
	bus?: MessageBus;
	delegationServices?: DelegationServices;
}

export class SkythAgentSession implements AgentSession {
	readonly subagents?: SubagentManager;
	private readonly orchestrator: AgentRunOrchestrator;

	constructor(options: SkythAgentSessionOptions = {}) {
		this.orchestrator = new AgentRunOrchestrator(options);
		if (options.provider && options.workspace) {
			this.subagents = new SubagentManager({
				provider: options.provider,
				workspace: options.workspace,
				bus: options.bus ?? new MessageBus(),
				model: options.defaultModel,
				max_tokens: options.maxTokens,
				restrict_to_workspace: true,
			});
			setSubagentManager(this.subagents);
			if (options.delegationServices) {
				options.delegationServices.subagentManager = this.subagents;
			}
		}
	}

	run(input: AgentInput, options: RunOptions = {}): AsyncIterable<RunEvent> {
		return this.orchestrator.run(input, options);
	}
}

export type { AgentInput, RunOptions };
