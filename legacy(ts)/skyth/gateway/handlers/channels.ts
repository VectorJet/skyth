import type { GatewayClient } from "@/gateway/protocol";
import type { ChannelManager } from "@/channels/manager";

export interface ChannelsHandlerDeps {
	channelManager: ChannelManager;
	getAuthenticatedNode: (client: GatewayClient) => {
		node_id: string;
		channel: string;
		sender_id: string;
	} | null;
}

export interface ChannelStatusEntry {
	enabled: boolean;
	running: boolean;
}

export interface ChannelsStatusResult {
	channels: Record<string, ChannelStatusEntry>;
}

export interface ChannelsConfigureResult {
	ok: boolean;
	channel: string;
	message?: string;
}

export function createChannelsHandlers(deps: ChannelsHandlerDeps) {
	const { channelManager, getAuthenticatedNode } = deps;

	return {
		"channels.status": async (
			_method: string,
			_params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const status = channelManager.getStatus();

			return {
				channels: status,
			} as ChannelsStatusResult;
		},

		"channels.configure": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as { channel?: string; enabled?: boolean } | undefined;
			const channelName = p?.channel;

			if (!channelName) {
				throw new Error("channel name is required");
			}

			// Get the channel
			const channel = channelManager.getChannel(channelName);
			if (!channel) {
				throw new Error(`channel "${channelName}" not found`);
			}

			// Currently only supports enabling/disabling
			// Full configuration would require more complex changes
			if (p?.enabled !== undefined) {
				// Note: The current ChannelManager doesn't support runtime enable/disable
				// This would require additional implementation
				return {
					ok: false,
					channel: channelName,
					message: "runtime enable/disable not supported - restart required",
				} as ChannelsConfigureResult;
			}

			return {
				ok: true,
				channel: channelName,
			} as ChannelsConfigureResult;
		},
	};
}
