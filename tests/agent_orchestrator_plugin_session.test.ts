import { describe, expect, test } from "bun:test";
import { AgentRunOrchestrator } from "@/base/base_agent/runtime/orchestrator";
import { PluginManager } from "@/base/base_agent/plugin/manager";
import type {
	Plugin,
	SessionHookContext,
} from "@/base/base_agent/plugin/types";
import { LLMProvider, type LLMResponse } from "@/providers/base";

class FinalProvider extends LLMProvider {
	async chat(): Promise<LLMResponse> {
		return {
			content: "plugin session final",
			tool_calls: [],
			finish_reason: "stop",
		};
	}

	getDefaultModel(): string {
		return "test/model";
	}
}

describe("AgentRunOrchestrator plugin session hooks", () => {
	test("fires session start and end around a hybrid run", async () => {
		const seen: Array<{ hook: string; context: SessionHookContext }> = [];
		const plugin: Plugin = {
			name: "session-recorder",
			onSessionStart: (context) => {
				seen.push({ hook: "start", context });
			},
			onSessionEnd: (context) => {
				seen.push({ hook: "end", context });
			},
		};
		const pluginManager = new PluginManager();
		pluginManager.register(plugin);
		const orchestrator = new AgentRunOrchestrator({
			provider: new FinalProvider(),
			pluginManager,
		});

		for await (const _event of orchestrator.run({
			text: "hello",
			threadId: "plugins:test",
			surface: "test",
		})) {
			// Drain the run.
		}

		expect(seen).toEqual([
			{
				hook: "start",
				context: {
					key: "plugins:test",
					sessionId: "plugins:test",
					channel: "test",
					chatId: "plugins:test",
					metadata: undefined,
				},
			},
			{
				hook: "end",
				context: {
					key: "plugins:test",
					sessionId: "plugins:test",
					channel: "test",
					chatId: "plugins:test",
					metadata: undefined,
				},
			},
		]);
	});
});
