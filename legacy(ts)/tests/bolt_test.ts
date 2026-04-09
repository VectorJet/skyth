import { test, expect } from "bun:test";
import { Session } from "../skyth/session/manager";

test("memoize context size", () => {
	const s = new Session("test");
	s.addMessage("user", "hello");
	expect(s.estimateContextSize()).toBe(5);

	s.addMessage("bot", "world");
	expect(s.estimateContextSize()).toBe(10);

	s.messages = [];
	expect(s.estimateContextSize()).toBe(0);
});
