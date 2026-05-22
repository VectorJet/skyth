import { describe, expect, test } from "bun:test";
import type { InboundMessage } from "@/base/base_agent/bus/events";
import {
	routeSubagentAnnouncement,
	subagentAnnouncementToIncoming,
} from "@/gateway/channels/subagent-announcements";
import type { IncomingMessage } from "@/gateway/channels/types";

describe("subagent announcement routing", () => {
	test("converts subagent bus messages to channel-origin internal turns", () => {
		const msg: InboundMessage = {
			channel: "system",
			senderId: "subagent",
			chatId: "slack:team:channel",
			content: "Subagent completed a task",
			timestamp: new Date("2026-05-22T13:00:00Z"),
			metadata: { subagent_id: "abc123", status: "ok" },
		};

		expect(subagentAnnouncementToIncoming(msg)).toMatchObject({
			channel: "slack",
			chatId: "team:channel",
			userId: "subagent",
			messageId: "abc123",
			text: "Subagent completed a task",
			isCommand: false,
		});
	});

	test("enqueues valid announcements into the gateway router", () => {
		const enqueued: IncomingMessage[] = [];
		const ok = routeSubagentAnnouncement(
			{
				channel: "system",
				senderId: "subagent",
				chatId: "web:tab-1",
				content: "Done",
				metadata: { subagent_id: "task1" },
			},
			{
				enqueueUser: (msg) => {
					enqueued.push(msg);
				},
			},
		);

		expect(ok).toBe(true);
		expect(enqueued).toHaveLength(1);
		expect(enqueued[0]).toMatchObject({
			channel: "web",
			chatId: "tab-1",
			text: "Done",
		});
	});

	test("rejects announcements without a channel-qualified chat id", () => {
		expect(
			routeSubagentAnnouncement(
				{
					channel: "system",
					senderId: "subagent",
					chatId: "missing-channel-separator",
					content: "Done",
				},
				{ enqueueUser: () => {} },
			),
		).toBe(false);
	});
});
