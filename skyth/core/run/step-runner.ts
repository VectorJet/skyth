import type { AgentInput, RunOptions } from "@/core/session/agent-session";
import type { RunEvent } from "@/core/events";

export class StepRunner {
	async *run(
		input: AgentInput,
		options: RunOptions = {},
	): AsyncIterable<RunEvent> {
		if (options.signal?.aborted) {
			yield { type: "warning", message: "Run cancelled before start." };
			return;
		}

		const text = input.text.trim();
		if (!text) {
			yield { type: "model_complete", text: "" };
			return;
		}

		yield {
			type: "warning",
			message:
				"Core StepRunner scaffold is active; provider/tool loop wiring is pending.",
		};
		yield { type: "model_complete", text };
	}
}
