import { describe, expect, test } from "bun:test";
import { Session } from "../skyth/session/manager";
import {
	clearConsolidationLock,
	scheduleConsolidation,
	setConsolidationLock,
	waitForConsolidationLock,
	type ConsolidationState,
} from "../skyth/base/base_agent/memory/consolidation";
import {
	buildMentalImageObservation,
	recordMentalImage,
} from "../skyth/base/base_agent/memory/mental_image";

describe("base agent memory module", () => {
	test("mental image ignores heartbeat/cron and records normal messages", () => {
		const hb = buildMentalImageObservation({
			channel: "system",
			senderId: "heartbeat",
			chatId: "sys",
			content: "tick",
		});
		expect(hb).toBeNull();

		const msg = buildMentalImageObservation({
			channel: "cli",
			senderId: "user1",
			chatId: "direct",
			content: "hello",
		});
		expect(msg).not.toBeNull();
		expect(msg?.senderId).toBe("user1");

		const seen: Array<{ senderId: string; channel: string; content: string }> =
			[];
		recordMentalImage(
			{
				updateMentalImage: (obs) => {
					seen.push({
						senderId: obs.senderId,
						channel: obs.channel,
						content: obs.content,
					});
				},
			},
			{
				channel: "cli",
				senderId: "user2",
				chatId: "direct",
				content: "persist this",
			},
		);
		expect(seen.length).toBe(1);
		expect(seen[0]?.content).toBe("persist this");
	});

	test("consolidation lock helpers and scheduler", async () => {
		const state: ConsolidationState = {
			memoryWindow: 2,
			consolidating: new Set<string>(),
			tasks: new Set<Promise<void>>(),
			locks: new Map<string, Promise<void>>(),
		};

		const session = new Session("cli:direct");
		session.addMessage("user", "one");
		session.addMessage("assistant", "two");

		let calls = 0;
		scheduleConsolidation({
			state,
			session,
			consolidate: async () => {
				calls += 1;
				return true;
			},
		});

		expect(calls).toBe(1);

		const p = Promise.resolve();
		setConsolidationLock(state, "cli:direct", p);
		expect(await waitForConsolidationLock(state, "cli:direct")).toBeUndefined();
		clearConsolidationLock(state, "cli:direct", p);
		expect(await waitForConsolidationLock(state, "missing")).toBeUndefined();
	});
});
