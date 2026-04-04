/**
 * @tool message
 * @author skyth-team
 * @version 1.0.0
 * @description Send a message to the user through the active channel or a provided channel/chat.
 * @tags communication
 */
import { defineTool } from "@/sdks/agent-sdk/tools";
import type { ToolExecutionContext } from "@/base/base_agent/tools/context";

export default defineTool({
	name: "message",
	description:
		"Send a message to the user through the active channel or a provided channel/chat.",
	parameters: {
		type: "object",
		properties: {
			content: { type: "string", description: "Message content to send" },
			channel: { type: "string", description: "Optional target channel" },
			chat_id: { type: "string", description: "Optional target chat ID" },
			message_id: { type: "string", description: "Optional source message ID" },
			media: {
				type: "array",
				items: { type: "string" },
				description: "Optional media paths",
			},
		},
		required: ["content"],
	},
	async execute(
		params: Record<string, any>,
		ctx?: ToolExecutionContext,
	): Promise<string> {
		const content = String(params.content ?? "");
		const channel = String(params.channel ?? ctx?.channel ?? "");
		const chatId = String(params.chat_id ?? ctx?.chatId ?? "");
		const messageId = String(params.message_id ?? ctx?.messageId ?? "");
		const media = Array.isArray(params.media)
			? params.media.map((item: unknown) => String(item))
			: [];

		if (!channel || !chatId) return "Error: No target channel/chat specified";
		if (!ctx?.bus) return "Error: Message sending not configured";

		const sourceChannel = ctx.channel ?? "";
		const sourceChatId = ctx.chatId ?? "";

		try {
			await ctx.bus.publishOutbound({
				channel,
				chatId,
				content,
				media,
				metadata: {
					message_id: messageId || undefined,
				},
			});
			if (ctx.turnTracker) {
				ctx.turnTracker.sentInTurn = true;
				ctx.turnTracker.sendRecords.push({
					sourceChannel,
					sourceChatId,
					targetChannel: channel,
					targetChatId: chatId,
				});
			}
			return `Message sent to ${channel}:${chatId}`;
		} catch (error) {
			return `Error sending message: ${error instanceof Error ? error.message : String(error)}`;
		}
	},
});
