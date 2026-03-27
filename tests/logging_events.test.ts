import { describe, expect, test } from "bun:test";
import { eventLine } from "../skyth/logging/events";

describe("logging events", () => {
	test("formats handoff kind lines", () => {
		const line = eventLine(
			"handoff",
			"session",
			"queue",
			"telegram:42 -> discord:99",
		);
		expect(line).toBe("[handoff][session] queue telegram:42 -> discord:99");
	});
});
