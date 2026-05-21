import type { SlashCommand } from "@/gateway/channels/types.ts";
import { getRuntime } from "@/gateway/channels/runtime.ts";
import { RagIndex } from "@/gateway/workspace/rag.ts";

export default {
	name: "rebuild_index",
	description: "Rebuild the RAG index for this chat workspace",
	handler: async ({ msg, reply }) => {
		const rt = getRuntime();
		const ws = await rt.workspaceManager.get(`${msg.channel}:${msg.chatId}`);
		const rag = new RagIndex(ws);
		const n = await rag.rebuild();
		await reply(`[GATEWAY] indexed ${n} chunks in ${ws.root}`);
	},
} satisfies SlashCommand;
