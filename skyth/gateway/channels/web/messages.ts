import type { IncomingMessage } from "@/gateway/channels/types.ts";
import type { NewThreadResult } from "@/gateway/channels/web/web-channel.ts";

export function toTelegramIncoming(msg: any): IncomingMessage {
	const t = msg.msg;
	const inc: IncomingMessage = {
		channel: "telegram",
		chatId: String(t.chat_id),
		userId: String(t.sender_username ?? t.chat_id),
		messageId: String(t.message_id ?? Date.now()),
		text: String(t.text ?? ""),
		ts: Date.now(),
		raw: t,
		isCommand: typeof t.text === "string" && t.text.startsWith("/"),
		command: undefined,
	};
	attachCommand(inc);
	return inc;
}

export function toWebIncoming(channel: string, msg: any): IncomingMessage {
	const inc: IncomingMessage = {
		channel,
		chatId: String(msg.chatId ?? "web"),
		userId: String(msg.userId ?? "web"),
		messageId: String(msg.messageId ?? Date.now()),
		text: String(msg.text ?? ""),
		ts: Date.now(),
		raw: msg,
		isCommand: typeof msg.text === "string" && msg.text.startsWith("/"),
		command: undefined,
	};
	attachCommand(inc);
	return inc;
}

function attachCommand(inc: IncomingMessage): void {
	if (!inc.isCommand) return;
	const space = inc.text.indexOf(" ");
	const head = space === -1 ? inc.text : inc.text.slice(0, space);
	inc.command = {
		name: head.slice(1),
		args: space === -1 ? "" : inc.text.slice(space + 1),
	};
}

export function resolveNewThreadResult(msg: any): NewThreadResult {
	return {
		ok: msg.ok !== false,
		traceId: msg.traceId,
		kind: msg.kind === "compaction" ? "compaction" : "handoff",
		switched: msg.switched === true,
		threadId: typeof msg.threadId === "string" ? msg.threadId : undefined,
		url: typeof msg.url === "string" ? msg.url : undefined,
		error: typeof msg.error === "string" ? msg.error : undefined,
	};
}
