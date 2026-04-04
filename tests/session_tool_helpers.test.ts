import { describe, expect, test } from "bun:test";
import {
	buildCompactMergeSummary,
	formatSessionList,
	searchSessionMessages,
	validateSessionKey,
} from "../skyth/base/base_agent/tools/session_tool_helpers";

describe("session tool helpers", () => {
	test("validates session key format", () => {
		expect(validateSessionKey("discord:123")).toBeNull();
		expect(validateSessionKey("discord")).toContain(
			"Invalid session key format",
		);
	});

	test("builds compact merge summary from recent user message", () => {
		const summary = buildCompactMergeSummary("discord:123", [
			{ role: "assistant", content: "hi" },
			{ role: "user", content: "Need help with a bug" },
		]);
		expect(summary).toContain("Source: discord:123");
		expect(summary).toContain("Need help with a bug");
	});

	test("formats session list with merged metadata", () => {
		const output = formatSessionList(
			[
				{
					key: "discord:1",
					branch: {
						key: "discord:1",
						createdAt: "",
						mergedFrom: ["telegram:2"],
					},
				},
			],
			{
				"discord:1": { messageCount: 3, tokenCount: 42 },
			},
		);
		expect(output).toContain("discord:1: 3 messages, ~42 tokens");
		expect(output).toContain("merged from: telegram:2");
	});

	test("searches session messages across sessions", () => {
		const result = searchSessionMessages(
			[
				{
					key: "discord:1",
					messages: [
						{ role: "user", content: "hello world" },
						{ role: "assistant", content: "bye" },
					],
				},
			],
			"hello",
			5,
		);
		expect(result.length).toBe(1);
		expect(result[0]?.session).toBe("discord:1");
	});
});
