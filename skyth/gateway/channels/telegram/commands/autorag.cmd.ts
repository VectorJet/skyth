import type { SlashCommand } from "@/gateway/channels/types.ts";

export default {
	name: "autorag",
	description: "Toggle global auto-RAG hints ON/OFF",
	handler: async ({ args, reply }) => {
		const cmd = args.trim().toLowerCase();

		if (cmd === "on" || cmd === "1" || cmd === "true") {
			process.env.CLAUDE_GATEWAY_RAG_AUTO = "1";
		} else if (cmd === "off" || cmd === "0" || cmd === "false") {
			process.env.CLAUDE_GATEWAY_RAG_AUTO = "0";
		} else {
			// Toggle if no specific arg
			process.env.CLAUDE_GATEWAY_RAG_AUTO =
				process.env.CLAUDE_GATEWAY_RAG_AUTO === "0" ? "1" : "0";
		}

		const state = process.env.CLAUDE_GATEWAY_RAG_AUTO === "0" ? "OFF" : "ON";
		await reply(`[GATEWAY] Global auto-RAG hints are now ${state}.`);
	},
} satisfies SlashCommand;
