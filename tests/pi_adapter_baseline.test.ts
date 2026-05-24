import { describe, expect, test } from "bun:test";
import {
	fromPiAssistantMessage,
	fromPiAssistantResponse,
	fromPiStreamEvent,
	parsePiModelRef,
	resolvePiProviderId,
	toPiContext,
	toPiTools,
} from "@/pi";
import type { PiAssistantMessage } from "@/pi/types";

describe("pi adapter baseline", () => {
	test("parsePiModelRef handles bare model id", () => {
		expect(parsePiModelRef("gpt-5-mini")).toEqual({
			provider: "openai",
			model: "gpt-5-mini",
		});
	});

	test("parsePiModelRef splits provider/model", () => {
		expect(parsePiModelRef("anthropic/claude-haiku-4.5")).toEqual({
			provider: "anthropic",
			model: "claude-haiku-4.5",
		});
	});

	test("parsePiModelRef keeps nested model id under gateway provider", () => {
		expect(
			parsePiModelRef("openrouter/anthropic/claude-3-5-sonnet"),
		).toEqual({
			provider: "openrouter",
			model: "anthropic/claude-3-5-sonnet",
		});
	});

	test("resolvePiProviderId normalizes skyth `_` to pi `-`", () => {
		expect(resolvePiProviderId("github_copilot")).toBe("github-copilot");
		expect(resolvePiProviderId("opencode_go")).toBe("opencode-go");
		expect(resolvePiProviderId("openai")).toBe("openai");
	});

	test("toPiContext collapses system messages and converts roles", () => {
		const context = toPiContext([
			{ role: "system", content: "You are helpful." },
			{ role: "system", content: "Be concise." },
			{ role: "user", content: "Hi" },
			{
				role: "assistant",
				content: "Calling tool.",
				reasoning_content: "thinking...",
				tool_calls: [
					{
						id: "call_1",
						type: "function",
						function: { name: "ls", arguments: '{"path":"/"}' },
					},
				],
			},
			{
				role: "tool",
				tool_call_id: "call_1",
				name: "ls",
				content: "file1\nfile2",
			},
		]);

		expect(context.systemPrompt).toBe("You are helpful.\n\nBe concise.");
		expect(context.messages).toHaveLength(3);

		const [user, assistant, toolResult] = context.messages;
		expect(user?.role).toBe("user");
		expect(assistant?.role).toBe("assistant");
		expect(toolResult?.role).toBe("toolResult");

		if (assistant?.role !== "assistant") throw new Error("unreachable");
		const blockTypes = assistant.content.map((b) => b.type);
		expect(blockTypes).toEqual(["thinking", "text", "toolCall"]);
	});

	test("toPiTools maps openai-function schema to pi tools", () => {
		const piTools = toPiTools([
			{
				type: "function",
				function: {
					name: "ls",
					description: "list files",
					parameters: {
						type: "object",
						properties: { path: { type: "string" } },
						required: ["path"],
					},
				},
			},
		]);
		expect(piTools).toEqual([
			{
				name: "ls",
				description: "list files",
				parameters: {
					type: "object",
					properties: { path: { type: "string" } },
					required: ["path"],
				},
			},
		]);
	});

	test("toPiTools skips entries missing a function name", () => {
		const piTools = toPiTools([
			{ type: "function", function: { description: "no name" } },
		]);
		expect(piTools).toEqual([]);
	});

	function makePiAssistant(): PiAssistantMessage {
		return {
			role: "assistant",
			api: "openai-completions",
			provider: "openai",
			model: "gpt-5-mini",
			usage: {
				input: 10,
				output: 20,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 30,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: 1_700_000_000_000,
			content: [
				{ type: "thinking", thinking: "plan." },
				{ type: "text", text: "Hello world" },
				{
					type: "toolCall",
					id: "call_1",
					name: "ls",
					arguments: { path: "/" },
				},
			],
		};
	}

	test("fromPiAssistantResponse merges content blocks into LLMResponse", () => {
		const message = makePiAssistant();
		const response = fromPiAssistantResponse(message, "stop");
		expect(response.content).toBe("Hello world");
		expect(response.reasoning_content).toBe("plan.");
		expect(response.tool_calls).toEqual([
			{ id: "call_1", name: "ls", arguments: { path: "/" } },
		]);
		expect(response.finish_reason).toBe("stop");
		expect(response.usage).toEqual({
			prompt_tokens: 10,
			completion_tokens: 20,
			total_tokens: 30,
			cache_read_tokens: 0,
			cache_write_tokens: 0,
		});
	});

	test("fromPiAssistantMessage reverses to skyth assistant shape", () => {
		const message = makePiAssistant();
		const skyth = fromPiAssistantMessage(message);
		expect(skyth.role).toBe("assistant");
		expect(skyth.content).toBe("Hello world");
		expect(skyth.reasoning_content).toBe("plan.");
		expect((skyth.tool_calls as unknown[])).toHaveLength(1);
	});

	test("fromPiStreamEvent maps deltas and ignores lifecycle events", () => {
		const message = makePiAssistant();
		const partial = message;
		expect(
			fromPiStreamEvent({ type: "start", partial }),
		).toBeNull();
		expect(
			fromPiStreamEvent({
				type: "text_delta",
				contentIndex: 0,
				delta: "hi",
				partial,
			}),
		).toEqual({ type: "text-delta", text: "hi" });
		expect(
			fromPiStreamEvent({
				type: "thinking_delta",
				contentIndex: 0,
				delta: "wh",
				partial,
			}),
		).toEqual({ type: "reasoning-delta", text: "wh" });
		expect(
			fromPiStreamEvent({
				type: "toolcall_end",
				contentIndex: 0,
				toolCall: {
					type: "toolCall",
					id: "call_1",
					name: "ls",
					arguments: { path: "/" },
				},
				partial,
			}),
		).toEqual({
			type: "tool-call",
			toolCallId: "call_1",
			toolName: "ls",
			args: JSON.stringify({ path: "/" }),
		});

		const done = fromPiStreamEvent({
			type: "done",
			reason: "toolUse",
			message,
		});
		expect(done?.type).toBe("done");
		if (done?.type === "done") {
			expect(done.response.finish_reason).toBe("tool_calls");
		}
	});
});
