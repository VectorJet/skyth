import type { Config } from "@/config/schema";
import type { Channel } from "@/gateway/channels/types.ts";
import { DiscordChannel } from "@/gateway/channels/discord-channel.ts";
import { SlackChannel } from "@/gateway/channels/slack-channel.ts";
import { TelegramChannel } from "@/gateway/channels/telegram/telegram-channel.ts";
import { WebChannel } from "@/gateway/channels/web/web-channel.ts";

export interface ConfiguredChannelSet {
	channels: Channel[];
	unsupportedEnabled: string[];
	skippedAgentChannels: string[];
}

const CONFIGURED_CHANNEL_NAMES = [
	"whatsapp",
	"telegram",
	"discord",
	"feishu",
	"mochat",
	"dingtalk",
	"slack",
	"qq",
	"email",
] as const;

function isEnabled(value: unknown): boolean {
	return Boolean(
		value &&
			typeof value === "object" &&
			(value as { enabled?: unknown }).enabled,
	);
}

function shouldSkipTelegramAgentTurns(): boolean {
	return process.env.CLAUDE_GATEWAY_TELEGRAM_POLLING === "0";
}

export function createConfiguredChannels(config: Config): ConfiguredChannelSet {
	const channels: Channel[] = [];
	const unsupportedEnabled: string[] = [];
	const skippedAgentChannels: string[] = [];

	if (config.channels.web?.enabled !== false) {
		channels.push(new WebChannel());
	}

	if (config.channels.telegram.enabled) {
		channels.push(new TelegramChannel(config.channels.telegram.token));
		if (shouldSkipTelegramAgentTurns()) skippedAgentChannels.push("telegram");
	}

	if (config.channels.discord.enabled) {
		channels.push(new DiscordChannel(config.channels.discord));
	}

	if (config.channels.slack.enabled) {
		channels.push(new SlackChannel(config.channels.slack));
	}

	for (const name of CONFIGURED_CHANNEL_NAMES) {
		if (["telegram", "discord", "slack"].includes(name)) continue;
		if (isEnabled(config.channels[name])) unsupportedEnabled.push(name);
	}

	return { channels, unsupportedEnabled, skippedAgentChannels };
}
