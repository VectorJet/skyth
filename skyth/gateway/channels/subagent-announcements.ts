import type { InboundMessage } from "@/base/base_agent/bus/events";
import type { MessageBus } from "@/base/base_agent/bus/queue";
import type { MessageRouter } from "@/gateway/channels/queue.ts";
import type { IncomingMessage } from "@/gateway/channels/types.ts";

export function subagentAnnouncementToIncoming(
	msg: InboundMessage,
): IncomingMessage | null {
	const separator = msg.chatId.indexOf(":");
	if (separator <= 0) return null;
	const channel = msg.chatId.slice(0, separator);
	const chatId = msg.chatId.slice(separator + 1);
	if (!channel || !chatId) return null;

	return {
		channel,
		chatId,
		userId: msg.senderId || "subagent",
		messageId: String(msg.metadata?.subagent_id ?? crypto.randomUUID()),
		text: msg.content,
		ts: msg.timestamp?.getTime() ?? Date.now(),
		raw: msg,
		isCommand: false,
	};
}

export function routeSubagentAnnouncement(
	msg: InboundMessage,
	router: Pick<MessageRouter, "enqueueUser">,
): boolean {
	const incoming = subagentAnnouncementToIncoming(msg);
	if (!incoming) return false;
	router.enqueueUser(incoming);
	return true;
}

export function startSubagentAnnouncementBridge(
	bus: MessageBus,
	router: Pick<MessageRouter, "enqueueUser">,
): void {
	void (async () => {
		for (;;) {
			const msg = await bus.consumeInbound();
			if (!routeSubagentAnnouncement(msg, router)) {
				console.warn(
					`[subagent] could not route announcement for chatId=${msg.chatId}`,
				);
			}
		}
	})().catch((err) => {
		console.warn("[subagent] announcement bridge stopped:", err);
	});
}
