import type { ChannelManager } from "@/gateway/channels/manager.ts";
import type { AgentTurnInput } from "@/gateway/channels/queue.ts";

export type AgentTurnRunner = (
	turn: AgentTurnInput,
	channelManager: ChannelManager,
) => Promise<void>;

export interface WebBridgeRunner {
	isConnected(): boolean;
	pickTab(): string;
	sendAndAwaitResponse(tabId: string, text: string): Promise<string>;
}

export interface ChannelTurnRunnerOptions {
	agentRunner?: AgentTurnRunner;
	web: WebBridgeRunner;
	preferWebBridge?: boolean;
	skippedAgentChannels?: string[];
}

export function createChannelTurnRunner(
	channelManager: ChannelManager,
	options: ChannelTurnRunnerOptions,
): (turn: AgentTurnInput) => Promise<void> {
	return async (turn) => {
		if (options.skippedAgentChannels?.includes(turn.origin.channel)) {
			console.log(
				`[runner] skip agent turn for externally handled channel=${turn.origin.channel} chatId=${turn.origin.chatId}`,
			);
			return;
		}

		if (options.agentRunner && !options.preferWebBridge) {
			await options.agentRunner(turn, channelManager);
			return;
		}

		if (options.web.isConnected()) {
			try {
				const targetTab =
					turn.origin.channel === "web"
						? turn.origin.chatId
						: options.web.pickTab();
				const reply = await options.web.sendAndAwaitResponse(
					targetTab,
					turn.text,
				);
				await mirrorReply(channelManager, turn, reply);
				return;
			} catch (err) {
				console.warn("[runner] web bridge failed, falling back:", err);
			}
		}

		if (options.agentRunner) await options.agentRunner(turn, channelManager);
	};
}

async function mirrorReply(
	channelManager: ChannelManager,
	turn: AgentTurnInput,
	reply: string,
): Promise<void> {
	if (turn.origin.channel === "web" || turn.userMessages.length === 0) return;
	const first = turn.userMessages[0];
	if (!first) return;
	await channelManager.send(first.channel, first.chatId, reply, {
		fromGateway: false,
	});
}
