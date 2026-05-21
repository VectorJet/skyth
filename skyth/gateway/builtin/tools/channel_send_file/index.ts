import * as fs from "fs/promises";
import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { getRuntime } from "@/gateway/channels/runtime.ts";

const DESCRIPTION = `Send a file from the active workspace OUTBOX/ (or any path inside the workspace) to a channel.

The path is resolved relative to the active workspace and refused if it escapes the sandbox.
Channels that don't support files reject with an error.`;

export const channelSendFileTool: ToolDefinition = {
	name: "channel_send_file",
	description: DESCRIPTION,
	parameters: [
		{
			name: "channel",
			type: "string",
			description: "Channel name (e.g. telegram, web)",
			required: true,
		},
		{
			name: "chatId",
			type: "string",
			description: "Channel-native chat id",
			required: true,
		},
		{
			name: "path",
			type: "string",
			description: "Path within the workspace (relative)",
			required: true,
		},
		{
			name: "caption",
			type: "string",
			description: "Optional caption",
			required: false,
		},
		{
			name: "workspaceId",
			type: "string",
			description: "Workspace id; defaults to <channel>:<chatId>",
			required: false,
		},
	],
	handler: async (args) => {
		const rt = getRuntime();
		const wsId = args.workspaceId ?? `${args.channel}:${args.chatId}`;
		const ws = await rt.workspaceManager.get(wsId);
		const abs = ws.safeResolve(args.path);

		try {
			await fs.access(abs);
		} catch {
			throw new Error(`File not found: ${abs}`);
		}

		await rt.channelManager.sendFile(
			args.channel,
			args.chatId,
			abs,
			args.caption,
		);
		return { sent: abs };
	},
	metadata: { category: "channel", tags: ["channel", "file"] },
};
