import {
	getNodeByToken,
	hasDeviceToken,
	listNodes,
	secureCompare,
} from "@/auth/cmd/token/shared";
import type { ChannelManager } from "@/channels/manager";
import type { EmitFn } from "./utils";

export interface TrustReport {
	totalTrusted: number;
	channels: Map<string, string[]>;
}

export function getTrustReport(channels: ChannelManager): TrustReport | null {
	if (!hasDeviceToken()) return null;

	const allVerifiedNodes = listNodes().filter((node) => node.mfa_verified);
	const reportableChannels = channels.enabledChannels.filter(
		(ch) => ch !== "email" && ch !== "cli" && ch !== "cron" && ch !== "system",
	);
	const trustedNodes = allVerifiedNodes.filter((node) =>
		reportableChannels.includes(node.channel),
	);

	const uniqueChannelSenders = new Map<string, Set<string>>();
	for (const node of trustedNodes) {
		if (!uniqueChannelSenders.has(node.channel)) {
			uniqueChannelSenders.set(node.channel, new Set());
		}
		uniqueChannelSenders.get(node.channel)!.add(node.sender_id);
	}

	let totalUniqueTrusted = 0;
	for (const senders of uniqueChannelSenders.values()) {
		totalUniqueTrusted += senders.size;
	}

	const channelTrusted = new Map<string, string[]>();
	for (const channelName of reportableChannels) {
		const nodesForChannel = trustedNodes.filter(
			(node) => node.channel === channelName,
		);
		if (nodesForChannel.length) {
			channelTrusted.set(
				channelName,
				Array.from(new Set(nodesForChannel.map((node) => node.sender_id))),
			);
		}
	}

	return { totalTrusted: totalUniqueTrusted, channels: channelTrusted };
}

export function emitTrustStatus(emit: EmitFn, channels: ChannelManager): void {
	const report = getTrustReport(channels);

	if (report) {
		emit(
			"event",
			"gateway",
			"trust",
			`${String(report.totalTrusted)} trusted node(s)`,
			undefined,
			undefined,
			false,
			true,
		);

		// Use reportableChannels to match getTrustReport logic
		const reportableChannels = channels.enabledChannels.filter(
			(ch) =>
				ch !== "email" && ch !== "cli" && ch !== "cron" && ch !== "system",
		);

		for (const channelName of reportableChannels) {
			const trusted = report.channels.get(channelName);
			if (trusted && trusted.length) {
				emit(
					"event",
					"gateway",
					"trust",
					`${channelName}: trusted sender(s) ${trusted.join(",")}`,
					undefined,
					undefined,
					false,
					true,
				);
			} else {
				emit(
					"event",
					"gateway",
					"trust",
					`${channelName}: no trusted nodes`,
					undefined,
					undefined,
					true,
					true,
				);
			}
		}
	} else {
		emit(
			"event",
			"gateway",
			"trust",
			"device token not configured; trust enforcement disabled",
			undefined,
			undefined,
			true,
			true,
		);
	}
}

export { hasDeviceToken, secureCompare, getNodeByToken };
