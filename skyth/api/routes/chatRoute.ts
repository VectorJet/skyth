import type { IncomingMessage, ServerResponse } from "node:http";
import { MessageBus } from "@/bus/queue";
import { WebChannel } from "@/channels/web";
import { getNodeByToken } from "@/auth/cmd/token/shared";

export async function handleChatRequest(
	req: IncomingMessage,
	res: ServerResponse,
	bus: MessageBus,
	webChannel: WebChannel,
): Promise<void> {
	const token = (req.headers.authorization || "").trim();
	const node = getNodeByToken(token);

	if (!node || node.channel !== "web") {
		res.statusCode = 401;
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
		return;
	}

	if (req.method !== "POST") {
		res.statusCode = 405;
		res.end(JSON.stringify({ success: false, error: "Method Not Allowed" }));
		return;
	}

	let body = "";
	for await (const chunk of req) {
		body += chunk;
	}

	try {
		const data = JSON.parse(body);
		const { content, chatId, senderId, metadata } = data;

		if (!content) {
			res.statusCode = 400;
			res.end(JSON.stringify({ success: false, error: "Content is required" }));
			return;
		}

		await webChannel.handleMessage(
			senderId || "web-user",
			chatId || "web-chat",
			content,
			[],
			metadata || {},
		);

		res.statusCode = 200;
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		res.end(JSON.stringify({ success: true }));
	} catch (error) {
		res.statusCode = 400;
		res.end(JSON.stringify({ success: false, error: "Invalid JSON" }));
	}
}
