import { describe, expect, test } from "bun:test";
import { AgentRunOrchestrator } from "@/base/base_agent/runtime/orchestrator";
import type { RunEvent, RunEventSink } from "@/core/events";
import { LLMProvider, type LLMResponse } from "@/providers/base";

class FinalProvider extends LLMProvider {
	async chat(): Promise<LLMResponse> {
		return {
			content: "persisted final",
			tool_calls: [],
			finish_reason: "stop",
		};
	}

	getDefaultModel(): string {
		return "test/model";
	}
}

class CapturingRunEventSink implements RunEventSink {
	events: RunEvent[] = [];

	record(event: RunEvent): void {
		this.events.push(event);
	}
}

describe("AgentRunOrchestrator run event persistence", () => {
	test("records emitted run events through the configured sink", async () => {
		const sink = new CapturingRunEventSink();
		const orchestrator = new AgentRunOrchestrator({
			provider: new FinalProvider(),
			runEventSink: sink,
		});

		const emitted: RunEvent[] = [];
		for await (const event of orchestrator.run({
			text: "record this",
			threadId: "events:test",
		})) {
			emitted.push(event);
		}

		expect(sink.events.map((event) => event.type)).toEqual(
			emitted.map((event) => event.type),
		);
		expect(sink.events[0]).toMatchObject({
			type: "run_start",
			threadId: "events:test",
		});
		expect(sink.events.at(-1)).toMatchObject({
			type: "run_finish",
			output: "persisted final",
		});
	});
});
