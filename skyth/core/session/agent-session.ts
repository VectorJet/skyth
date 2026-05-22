import type { RunEvent } from "@/core/events";
import { AgentRunOrchestrator } from "@/core/run/orchestrator";

export interface AgentInput {
	text: string;
	threadId?: string;
	surface?: string;
	metadata?: Record<string, unknown>;
}

export interface RunOptions {
	signal?: AbortSignal;
	maxSteps?: number;
}

export interface AgentSession {
	run(input: AgentInput, options?: RunOptions): AsyncIterable<RunEvent>;
}

export class SkythAgentSession implements AgentSession {
	constructor(private readonly orchestrator = new AgentRunOrchestrator()) {}

	run(input: AgentInput, options: RunOptions = {}): AsyncIterable<RunEvent> {
		return this.orchestrator.run(input, options);
	}
}
