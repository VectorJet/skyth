import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { getRuntime } from "@/gateway/channels/runtime.ts";

export const channelReactTool: ToolDefinition = {
	name: "channel_react",
	description:
		"React to a user message on a channel with an emoji (channels that support reactions only).",
	parameters: [
		{
			name: "channel",
			type: "string",
			description: "Channel name",
			required: true,
		},
		{ name: "chatId", type: "string", description: "Chat id", required: true },
		{
			name: "messageId",
			type: "string",
			description: "Channel-native message id to react to",
			required: true,
		},
		{
			name: "emoji",
			type: "string",
			description: "Emoji to add",
			required: true,
		},
	],
	handler: async (args) => {
		const rt = getRuntime();
		await rt.channelManager.react(
			args.channel,
			args.chatId,
			args.messageId,
			args.emoji,
		);
		return {};
	},
	metadata: { category: "channel", tags: ["channel", "reaction"] },
};
