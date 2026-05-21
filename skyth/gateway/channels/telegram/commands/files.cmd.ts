import { readdir } from "fs/promises";
import { join } from "path";
import type { SlashCommand } from "@/gateway/channels/types.ts";
import { getRuntime } from "@/gateway/channels/runtime.ts";

export default {
	name: "files",
	description: "List files staged in OUTBOX/",
	handler: async ({ msg, reply }) => {
		const rt = getRuntime();
		const ws = await rt.workspaceManager.get(`${msg.channel}:${msg.chatId}`);
		try {
			const items = await readdir(join(ws.root, "OUTBOX"));
			await reply(
				items.length === 0
					? "[GATEWAY] OUTBOX is empty"
					: `[GATEWAY] OUTBOX:\n${items.map((i) => `- ${i}`).join("\n")}`,
			);
		} catch (err) {
			await reply(
				`[GATEWAY] could not read OUTBOX: ${String((err as Error).message)}`,
			);
		}
	},
} satisfies SlashCommand;
