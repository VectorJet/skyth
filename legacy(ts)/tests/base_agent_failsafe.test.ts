import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { MessageBus } from "../skyth/bus/queue";
import { AgentLoop } from "../skyth/base/base_agent/runtime";
import { LLMProvider, type LLMResponse } from "../skyth/providers/base";

class RecoverAfterProviderError extends LLMProvider {
	calls = 0;

	async chat(_params: {
		messages: Array<Record<string, any>>;
		tools?: Array<Record<string, any>>;
		model?: string;
		max_tokens?: number;
		temperature?: number;
	}): Promise<LLMResponse> {
		this.calls += 1;
		if (this.calls === 1) {
			return {
				content:
					"Provider error: Failed after 3 attempts. Last error: temporary upstream issue",
				tool_calls: [],
				finish_reason: "stop",
			};
		}
		return {
			content: "Recovered reply",
			tool_calls: [],
			finish_reason: "stop",
		};
	}

	getDefaultModel(): string {
		return "mock/provider";
	}
}

class ErrorAfterToolCallProvider extends LLMProvider {
	calls = 0;

	async chat(_params: {
		messages: Array<Record<string, any>>;
		tools?: Array<Record<string, any>>;
		model?: string;
		max_tokens?: number;
		temperature?: number;
	}): Promise<LLMResponse> {
		this.calls += 1;
		if (this.calls === 1) {
			return {
				content: null,
				tool_calls: [
					{
						id: "tc1",
						name: "list_dir",
						arguments: { path: "." },
					},
				],
				finish_reason: "tool_calls",
			};
		}
		return {
			content:
				"Provider error: Failed after 3 attempts. Last error: rate limit exceeded",
			tool_calls: [],
			finish_reason: "stop",
		};
	}

	getDefaultModel(): string {
		return "mock/provider";
	}
}

class PersistentProviderError extends LLMProvider {
	async chat(_params: {
		messages: Array<Record<string, any>>;
		tools?: Array<Record<string, any>>;
		model?: string;
		max_tokens?: number;
		temperature?: number;
	}): Promise<LLMResponse> {
		// Return error that doesn't trigger rate-limit backoff (no "rate limit" in content)
		return {
			content:
				"Provider error: Failed after 3 attempts. Last error: upstream unavailable",
			tool_calls: [],
			finish_reason: "stop",
		};
	}

	getDefaultModel(): string {
		return "mock/provider";
	}
}

describe("base agent failsafe", () => {
	test("recovers from transient provider error and continues turn", async () => {
		const workspace = join(
			process.cwd(),
			".tmp",
			`failsafe-recover-${Date.now()}`,
		);
		mkdirSync(workspace, { recursive: true });
		try {
			const loop = new AgentLoop({
				bus: new MessageBus(),
				provider: new RecoverAfterProviderError(),
				workspace,
				model: "mock/provider",
				enable_global_tools: false,
			});
			await loop.toolsReady;

			const response = await loop.processMessage({
				channel: "cli",
				senderId: "u",
				chatId: "direct",
				content: "hello",
			});

			expect(response).not.toBeNull();
			expect(String(response?.content ?? "")).toContain("Recovered reply");
			expect(String(response?.content ?? "")).not.toContain("Provider error:");
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	test("uses tool-result fallback when provider fails after tool execution", async () => {
		const workspace = join(
			process.cwd(),
			".tmp",
			`failsafe-tool-${Date.now()}`,
		);
		mkdirSync(workspace, { recursive: true });
		try {
			const loop = new AgentLoop({
				bus: new MessageBus(),
				provider: new ErrorAfterToolCallProvider(),
				workspace,
				model: "mock/provider",
				enable_global_tools: true,
			});
			await loop.toolsReady;

			const response = await loop.processMessage({
				channel: "cli",
				senderId: "u",
				chatId: "direct",
				content: "list files",
			});

			expect(response).not.toBeNull();
			const content = String(response?.content ?? "");
			expect(content).toContain("tool step completed");
			expect(content).toContain("list_dir:");
			expect(content).not.toContain("Provider error:");
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	}, 30000); // Timeout needed for provider retry backoff

	test("degrades gracefully on persistent provider failure without surfacing raw provider error", async () => {
		const workspace = join(
			process.cwd(),
			".tmp",
			`failsafe-persistent-${Date.now()}`,
		);
		mkdirSync(workspace, { recursive: true });
		try {
			const loop = new AgentLoop({
				bus: new MessageBus(),
				provider: new PersistentProviderError(),
				workspace,
				model: "mock/provider",
				enable_global_tools: false,
				max_iterations: 10, // Enough iterations to hit degraded mode (requires 5 provider errors)
			});
			await loop.toolsReady;

			const response = await loop.processMessage({
				channel: "cli",
				senderId: "u",
				chatId: "direct",
				content: "search latest app rankings",
			});

			expect(response).not.toBeNull();
			const content = String(response?.content ?? "");
			expect(content).toContain("degraded mode");
			expect(content).not.toContain("Provider error:");
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	}, 30000); // Increased timeout for this test (needs time for retries)
});
