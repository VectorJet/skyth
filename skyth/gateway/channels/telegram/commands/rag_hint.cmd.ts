import type { SlashCommand } from "@/gateway/channels/types.ts";
import autorag from "@/gateway/channels/telegram/commands/autorag.cmd.ts";

export default {
	...autorag,
	name: "rag_hint",
	description: "Alias for /autorag (Toggle global auto-RAG hints)",
} satisfies SlashCommand;
