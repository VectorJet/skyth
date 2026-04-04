import { ensureDevicePaths, addNode } from "@/auth/cmd/token/shared";
import { PairingManager } from "@/auth/cmd/token/pairing-manager";
import { loadConfig } from "@/config/loader";
import { MessageBus } from "@/bus/queue";
import { DiscordChannel } from "@/channels/discord";
import { TelegramChannel } from "@/channels/telegram";
import { SlackChannel } from "@/channels/slack";
import { WhatsAppChannel } from "@/channels/whatsapp";
import type { BaseChannel } from "@/channels/base";

const CHANNELS_THAT_SUPPORT_PAIRING = [
	"telegram",
	"discord",
	"slack",
	"whatsapp",
];

export async function handleChannelPairing(
	channel: string,
	clackNote: (msg: string, title?: string) => void,
	consoleLog: (msg: string) => void,
	pendingConfig?: Record<string, any>,
): Promise<{ paired: boolean; senderId?: string }> {
	if (!CHANNELS_THAT_SUPPORT_PAIRING.includes(channel)) {
		return { paired: false };
	}

	ensureDevicePaths();
	const pairingManager = new PairingManager();
	let adapter:
		| (BaseChannel & { setPairingEndpoint(url: string | null): void })
		| null = null;

	try {
		const { code, url } = await pairingManager.start(channel, 120000);

		const cfg = loadConfig();
		const channelConfig = {
			...(cfg.channels as any)[channel],
			...pendingConfig,
		};
		const bus = new MessageBus();
		switch (channel) {
			case "discord":
				adapter = new DiscordChannel(channelConfig, bus);
				break;
			case "telegram":
				adapter = new TelegramChannel(channelConfig, bus);
				break;
			case "slack":
				adapter = new SlackChannel(channelConfig, bus);
				break;
			case "whatsapp":
				adapter = new WhatsAppChannel(channelConfig, bus);
				break;
		}
		if (adapter) {
			adapter.setPairingEndpoint(url);
			await adapter.start();
		}

		const noteMsg =
			"Pairing code: " +
			code +
			"\n" +
			"Send this code from your " +
			channel +
			" chat to pair your device.\n" +
			"Waiting up to 2 minutes...";
		clackNote(noteMsg, "Channel Pairing");

		consoleLog("\nPairing code: " + code);
		consoleLog("Send this code from your " + channel + " to pair your device.");
		consoleLog("Waiting up to 2 minutes...\n");

		const result = await pairingManager.awaitResult(120000);

		if (adapter) await adapter.stop().catch(() => {});

		if (result.status === "paired" && result.senderId) {
			const node = addNode(channel, result.senderId, {
				...result.metadata,
				onboarded_at: new Date().toISOString(),
			});

			clackNote(
				"Successfully paired!\nSender ID:  " +
					result.senderId +
					"\nNode token stored securely.",
				"Pairing Complete",
			);
			consoleLog("Successfully paired!");
			consoleLog("Sender ID:  " + result.senderId);
			consoleLog("Node token stored securely.\n");

			return { paired: true, senderId: result.senderId };
		} else {
			const failedMsg =
				"Pairing timed out or failed. You can pair later with: skyth auth token add-node --channel " +
				channel;
			clackNote(failedMsg, "Pairing");
			consoleLog("Pairing timed out or failed.");
			consoleLog(
				"You can pair later with: skyth auth token add-node --channel " +
					channel +
					"\n",
			);
			return { paired: false };
		}
	} finally {
		if (adapter) await adapter.stop().catch(() => {});
		await pairingManager.stop();
	}
}
