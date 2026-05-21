import { readFile } from "fs/promises";
import type { SlashCommand } from "@/gateway/channels/types.ts";
import { getRuntime } from "@/gateway/channels/runtime.ts";

export default {
	name: "heartbeat",
	description: "Show current HEARTBEAT.md pulse",
	handler: async ({ msg, reply }) => {
		const rt = getRuntime();
		const ws = await rt.workspaceManager.get(`${msg.channel}:${msg.chatId}`);
		try {
			const body = await readFile(ws.heartbeatPath(), "utf8");
			const pulse =
				body.split("## Pulse")[1]?.split("## ")[0]?.trim() ?? "(no pulse yet)";
			await reply(`[GATEWAY] HEARTBEAT pulse:\n${pulse}`.slice(0, 3500));
		} catch {
			await reply("[GATEWAY] no HEARTBEAT.md yet");
		}
	},
} satisfies SlashCommand;
