import { describe, expect, test } from "bun:test";
import { AgentRunOrchestrator } from "@/base/base_agent/runtime/orchestrator";
import { MemoryManager } from "@/base/base_agent/memory/manager";
import type {
	MemoryProvider,
	MemoryProviderInitializeOptions,
	MemoryTurnContext,
} from "@/base/base_agent/memory/provider";
import { LLMProvider, type LLMResponse } from "@/providers/base";

class MemoryProviderStub implements MemoryProvider {
	readonly name = "stub";
	initialized: MemoryProviderInitializeOptions | null = null;
	synced: Array<{
		user: string;
		assistant: string;
		context: MemoryTurnContext;
	}> = [];
	toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

	isAvailable(): boolean {
		return true;
	}

	initialize(options: MemoryProviderInitializeOptions): void {
		this.initialized = options;
	}

	systemPromptBlock(): string {
		return "Memory system prompt";
	}

	prefetch(): string {
		return "Remembered context";
	}

	syncTurn(
		userContent: string,
		assistantContent: string,
		context: MemoryTurnContext,
	): void {
		this.synced.push({
			user: userContent,
			assistant: assistantContent,
			context,
		});
	}

	getToolSchemas(): Array<Record<string, unknown>> {
		return [
			{
				name: "memory_search",
				description: "Search memory",
				parameters: {
					type: "object",
					properties: {
						query: { type: "string" },
					},
					required: ["query"],
				},
			},
		];
	}

	handleToolCall(toolName: string, args: Record<string, unknown>): string {
		this.toolCalls.push({ name: toolName, args });
		return "memory result";
	}

	shutdown(): void {}
}

class MemoryToolProvider extends LLMProvider {
	calls = 0;

	async chat(params: {
		messages: Array<Record<string, unknown>>;
		tools?: Array<Record<string, unknown>>;
	}): Promise<LLMResponse> {
		this.calls += 1;
		const system = String(params.messages[0]?.content ?? "");
		expect(system).toContain("Memory system prompt");
		expect(system).toContain("Remembered context");
		expect(
			params.tools?.some((tool) => tool.function?.name === "memory_search"),
		).toBe(true);

		if (this.calls === 1) {
			return {
				content: "",
				tool_calls: [
					{
						id: "call_memory",
						name: "memory_search",
						arguments: { query: "project" },
					},
				],
				finish_reason: "tool_calls",
			};
		}

		const toolMessage = params.messages.find(
			(message) => message.role === "tool" && message.name === "memory_search",
		);
		expect(toolMessage?.content).toBe("memory result");
		return {
			content: "final answer",
			tool_calls: [],
			finish_reason: "stop",
		};
	}

	getDefaultModel(): string {
		return "test/model";
	}
}

describe("AgentRunOrchestrator memory integration", () => {
	test("injects memory context, exposes memory tools, and syncs the turn", async () => {
		const memoryProvider = new MemoryProviderStub();
		const memoryManager = new MemoryManager();
		memoryManager.addProvider(memoryProvider);
		const provider = new MemoryToolProvider();
		const orchestrator = new AgentRunOrchestrator({
			provider,
			memoryManager,
			workspace: "/tmp/skyth-test",
		});

		const events = [];
		for await (const event of orchestrator.run({
			text: "What do you remember?",
			threadId: "memory:test",
			surface: "test",
		})) {
			events.push(event);
		}

		expect(provider.calls).toBe(2);
		expect(memoryProvider.initialized).toMatchObject({
			threadId: "memory:test",
			workspace: "/tmp/skyth-test",
		});
		expect(memoryProvider.toolCalls).toEqual([
			{ name: "memory_search", args: { query: "project" } },
		]);
		expect(memoryProvider.synced).toHaveLength(1);
		expect(memoryProvider.synced[0]).toMatchObject({
			user: "What do you remember?",
			assistant: "final answer",
		});
		expect(events.at(-1)).toMatchObject({
			type: "run_finish",
			output: "final answer",
		});
	});
});
