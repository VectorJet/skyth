import { describe, expect, test } from "bun:test";
import { WebChannel } from "@/channels/web";

function createChannel() {
	const events: Array<{ event: string; payload: any }> = [];
	const channel = new WebChannel({}, {} as never);
	channel.setBroadcastFn((event, payload) => {
		events.push({ event, payload });
	});
	return { channel, events };
}

describe("WebChannel streaming", () => {
	test("keeps text and reasoning buffers separate", () => {
		const { channel, events } = createChannel();

		channel.streamDelta("chat-1", {
			type: "reasoning-delta",
			text: "thinking",
		});
		channel.streamDelta("chat-1", {
			type: "text-delta",
			text: "hello",
		});

		expect(events).toHaveLength(2);
		expect(events[0]?.payload.type).toBe("reasoning-delta");
		expect(events[0]?.payload.message.content[0].text).toBe("thinking");
		expect(events[1]?.payload.type).toBe("text-delta");
		expect(events[1]?.payload.message.content[0].text).toBe("hello");
	});

	test("resets both buffers after final", () => {
		const { channel, events } = createChannel();

		channel.streamDelta("chat-1", {
			type: "reasoning-delta",
			text: "thinking",
		});
		channel.streamFinal("chat-1", {
			text: "done",
			stopReason: "stop",
		});
		channel.streamDelta("chat-1", {
			type: "text-delta",
			text: "fresh",
		});

		expect(events[2]?.payload.type).toBe("text-delta");
		expect(events[2]?.payload.message.content[0].text).toBe("fresh");
	});
});
