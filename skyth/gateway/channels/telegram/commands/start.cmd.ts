import type { SlashCommand } from "@/gateway/channels/types.ts";
import { getRuntime } from "@/gateway/channels/runtime.ts";

export default {
	name: "start",
	description: "Greet and show the active workspace",
	handler: async ({ msg, reply }) => {
		const rt = getRuntime();
		const ws = await rt.workspaceManager.get(`${msg.channel}:${msg.chatId}`);
		await reply(
			`[GATEWAY] Hi! Workspace: ${ws.root}\nUse /heartbeat /queue /files /rag <q>.`,
		);
	},
} satisfies SlashCommand;
