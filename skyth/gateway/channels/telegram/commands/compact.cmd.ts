import type { SlashCommand } from "@/gateway/channels/types.ts";
import { getRuntime } from "@/gateway/channels/runtime.ts";

const COMPACT_PROMPT = `[GATEWAY | COMPACTION]
Compact this Claude thread into a new Claude session.

Produce a detailed but compact handoff summary covering:
- current goal and user intent
- key decisions and constraints
- files/code touched and current implementation state
- commands/tests run and their results
- unresolved issues and next steps
- the exact next prompt to continue in a fresh Claude session

Then call the gateway tool thread:handoff with threadId="current", kind="compaction", switchToNew=true, summary=<your handoff>, and nextPrompt=<the exact next prompt>. This will start the new chat and switch the browser to it.`;

export default {
	name: "compact",
	description:
		"Ask Claude to summarize this thread, start a compacted thread, and switch to it",
	handler: async ({ reply }) => {
		const rt = getRuntime();
		rt.channelManager.router.pushGateway(COMPACT_PROMPT, "compact");
		await reply(
			"[GATEWAY] Asked Claude to compact this thread and switch to the new session.",
		);
	},
} satisfies SlashCommand;
