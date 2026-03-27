import type { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { Config } from "@/config/schema";
import { BaseChannel } from "@/channels/base";
import { DiscordChannel } from "@/channels/discord";
import { EmailChannel } from "@/channels/email";
import { SlackChannel } from "@/channels/slack";
import { TelegramChannel } from "@/channels/telegram";
import { WhatsAppChannel } from "@/channels/whatsapp";
import { WebChannel } from "@/channels/web";
import { eventLine } from "@/logging/events";
import { hasDeviceToken } from "@/auth/cmd/token/shared";

export class ChannelManager {
	private readonly config: Config;
	private readonly bus: MessageBus;
	private readonly channels = new Map<string, BaseChannel>();
	private dispatchTask?: Promise<void>;
	private running = false;
	private pairingUrl: string | null = null;

	constructor(config: Config, bus: MessageBus) {
		this.config = config;
		this.bus = bus;
		this.initChannels();
	}

	private initChannels(): void {
		const hasToken = hasDeviceToken();
		this.pairingUrl = hasToken ? "http://127.0.0.1:18798" : null;

		if (this.config.channels.web?.enabled) {
			this.channels.set(
				"web",
				new WebChannel(this.config.channels.web, this.bus),
			);
		}
		if (this.config.channels.telegram.enabled) {
			const channel = new TelegramChannel(
				this.config.channels.telegram,
				this.bus,
			);
			if (this.pairingUrl) channel.setPairingEndpoint(this.pairingUrl);
			this.channels.set("telegram", channel);
		}
		if (this.config.channels.whatsapp.enabled) {
			const channel = new WhatsAppChannel(
				this.config.channels.whatsapp,
				this.bus,
			);
			if (this.pairingUrl) channel.setPairingEndpoint(this.pairingUrl);
			this.channels.set("whatsapp", channel);
		}
		if (this.config.channels.discord.enabled) {
			const channel = new DiscordChannel(
				this.config.channels.discord,
				this.bus,
			);
			if (this.pairingUrl) channel.setPairingEndpoint(this.pairingUrl);
			this.channels.set("discord", channel);
		}
		if (this.config.channels.slack.enabled) {
			const channel = new SlackChannel(this.config.channels.slack, this.bus);
			if (this.pairingUrl) channel.setPairingEndpoint(this.pairingUrl);
			this.channels.set("slack", channel);
		}
		if (this.config.channels.email.enabled) {
			this.channels.set(
				"email",
				new EmailChannel(this.config.channels.email, this.bus),
			);
		}
	}

	async startAll(): Promise<void> {
		this.running = true;
		if (!this.channels.size) {
			console.error(eventLine("event", "gateway", "warn", "no channels"));
		}
		for (const [, channel] of this.channels) {
			try {
				await channel.start();
				console.log(eventLine("event", channel.name, "status", "started"));
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(
					eventLine("event", channel.name, "error", `start ${message}`),
				);
			}
		}
		this.dispatchTask = this.dispatchOutbound();
	}

	async stopAll(): Promise<void> {
		this.running = false;
		if (this.dispatchTask) await this.dispatchTask.catch(() => undefined);
		for (const [, channel] of this.channels) {
			try {
				await channel.stop();
				console.log(eventLine("event", channel.name, "status", "stopped"));
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(
					eventLine("event", channel.name, "error", `stop ${message}`),
				);
			}
		}
	}

	private async dispatchOutbound(): Promise<void> {
		while (this.running) {
			const msg = await this.bus.consumeOutboundWithTimeout(250);
			if (!msg) continue;
			const channel = this.channels.get(msg.channel);
			if (!channel) {
				console.error(eventLine("event", "gateway", "drop", "unknown chan"));
				continue;
			}
			Promise.resolve().then(async () => {
				try {
					await channel.send(msg);
					console.log(eventLine("event", msg.channel, "send", "outbound"));
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					console.error(
						eventLine("event", msg.channel, "error", `send ${message}`),
					);
				}
			});
		}
	}

	getChannel(name: string): BaseChannel | undefined {
		return this.channels.get(name);
	}

	get enabledChannels(): string[] {
		return [...this.channels.keys()];
	}

	getStatus(): Record<string, { enabled: boolean; running: boolean }> {
		const out: Record<string, { enabled: boolean; running: boolean }> = {};
		for (const [name, channel] of this.channels) {
			out[name] = { enabled: true, running: channel.isRunning };
		}
		return out;
	}
}
