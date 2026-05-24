import { describe, expect, test } from "bun:test";
import {
	coalesceSystemMessages,
	normalizeJsonSchema,
	stripToolHistoryForProvider,
	toMessages,
} from "@/providers/ai_sdk_provider_tools";

describe("normalizeJsonSchema", () => {
	test("adds default items schemas to arrays recursively", () => {
		const schema = normalizeJsonSchema({
			type: "object",
			properties: {
				names: { type: "array" },
				edits: {
					type: "array",
					items: {
						type: "object",
						properties: {
							paths: { type: "array" },
						},
					},
				},
			},
		});

		expect(schema.properties.names.items).toEqual({ type: "string" });
		expect(schema.properties.edits.items.properties.paths.items).toEqual({
			type: "string",
		});
	});
});

describe("toMessages", () => {
	test("coalesces interleaved system messages into one leading system block", () => {
		const messages = toMessages([
			{ role: "system", content: "root" },
			{ role: "user", content: "hello" },
			{ role: "system", content: "memory" },
			{ role: "assistant", content: "hi" },
			{ role: "system", content: "routing" },
		]);

		expect(messages).toEqual([
			{ role: "system", content: "root\n\nmemory\n\nrouting" },
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "hi" },
		]);
	});
});

describe("coalesceSystemMessages", () => {
	test("leaves conversations without system messages unchanged", () => {
		const messages = [{ role: "user" as const, content: "hello" }];
		expect(coalesceSystemMessages(messages)).toEqual(messages);
	});
});

describe("stripToolHistoryForProvider", () => {
	test("removes assistant tool calls and tool results from replayed history", () => {
		const messages = toMessages([
			{ role: "user", content: "search memory" },
			{
				role: "assistant",
				content: "",
				tool_calls: [
					{
						id: "call_1",
						name: "memory_search",
						arguments: { query: "x" },
					},
				],
			},
			{ role: "tool", tool_call_id: "call_1", content: "result" },
			{ role: "assistant", content: "done" },
		]);

		expect(stripToolHistoryForProvider(messages)).toEqual([
			{ role: "user", content: "search memory" },
			{ role: "assistant", content: "done" },
		]);
	});
});
