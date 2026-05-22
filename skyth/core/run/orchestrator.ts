import type { AgentInput, RunOptions } from "@/core/session/agent-session";
import type { RunEvent } from "@/core/events";
import { StepRunner } from "@/core/run/step-runner";

export class AgentRunOrchestrator {
	constructor(private readonly stepRunner = new StepRunner()) {}

	async *run(
		input: AgentInput,
		options: RunOptions = {},
	): AsyncIterable<RunEvent> {
		const threadId = input.threadId?.trim() || "cli:default";
		const runId = crypto.randomUUID();
		yield { type: "turn_start", threadId, runId };

		for await (const event of this.stepRunner.run(input, options)) {
			yield event;
		}

		yield { type: "turn_finish", threadId, runId };
	}
}
