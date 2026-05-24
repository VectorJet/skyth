import { expect, test, describe } from "bun:test";
import { AgentRunOrchestrator } from "@/base/base_agent/runtime/orchestrator";
import { createPiProvider } from "@/pi/factory";
import type { PiStreamEngine, PiStreamRequest, PiStreamResult } from "@/pi/provider";
import type { PiAssistantMessage, PiStopReason } from "@/pi/types";

describe("Pi Provider Integration", () => {
	test("AgentRunOrchestrator can complete a gateway turn using PiProvider", async () => {
		const fauxEngine: PiStreamEngine = async (request: PiStreamRequest): Promise<PiStreamResult> => {
			const message: PiAssistantMessage = {
				role: "assistant",
				content: [{ type: "text", text: "Hello from faux pi provider!" }],
				api: "faux",
				provider: "faux",
				model: "faux-1",
				usage: {
					input: 10,
					output: 10,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 20,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: Date.now(),
			};

			if (request.onEvent) {
				request.onEvent({
					type: "text_delta",
					contentIndex: 0,
					delta: "Hello from faux pi provider!",
					partial: message,
				});
				request.onEvent({
					type: "done",
					reason: "stop",
					message,
				});
			}

			return { message, stopReason: "stop" };
		};

		const provider = createPiProvider({
			modelOverride: "faux/faux-1",
			engine: fauxEngine,
		});

		const orchestrator = new AgentRunOrchestrator({ provider });
		const events: any[] = [];
		for await (const event of orchestrator.run({ messages: [{ role: "user", content: "hi" }] })) {
			events.push(event);
		}
		const stepEvents = events.filter((e) => e.type === "step_finish");
		expect(stepEvents.length).toBeGreaterThan(0);
		
		const lastStep = stepEvents[stepEvents.length - 1];
		expect(lastStep.finishReason).toBe("stop");
	});
});
