import type { SlashCommand } from "@/gateway/channels/types.ts";
import { getRuntime } from "@/gateway/channels/runtime.ts";

export default {
	name: "queue",
	description: "Show the message router queue depth",
	handler: async ({ reply }) => {
		const rt = getRuntime();
		const stats = rt.channelManager.router.stats();
		await reply(
			`[GATEWAY] queue: user=${stats.queuedUser} gateway=${stats.pendingGateway} inFlight=${stats.inFlight}`,
		);
	},
} satisfies SlashCommand;
