import type { SlashCommand } from "@/gateway/channels/types.ts";
import { getRuntime } from "@/gateway/channels/runtime.ts";

export default {
	name: "reset",
	description: "Clear the gateway message queue and stack",
	handler: async ({ reply }) => {
		const rt = getRuntime();
		// Drain by replacing the router state through a fresh push that supersedes
		// every tagged item. Untagged items are left to flush naturally.
		const stats = rt.channelManager.router.stats();
		rt.channelManager.router.pushGateway("Queue reset by user.", "reset");
		await reply(
			`[GATEWAY] reset signaled (was user=${stats.queuedUser}, gateway=${stats.pendingGateway})`,
		);
	},
} satisfies SlashCommand;
