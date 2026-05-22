import type { RunEvent } from "@/core/events";
import { AgentRunOrchestrator } from "@/base/base_agent/runtime/orchestrator";
import type { AgentInput, RunOptions } from "@/base/base_agent/runtime/types";

export interface AgentSession {
	run(input: AgentInput, options?: RunOptions): AsyncIterable<RunEvent>;
}

export class SkythAgentSession implements AgentSession {
	constructor(private readonly orchestrator = new AgentRunOrchestrator()) {}

	run(input: AgentInput, options: RunOptions = {}): AsyncIterable<RunEvent> {
		return this.orchestrator.run(input, options);
	}
}

export type { AgentInput, RunOptions };
