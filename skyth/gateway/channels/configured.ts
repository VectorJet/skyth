import type { Config } from "@/config/schema";
import type { Channel } from "@/gateway/channels/types.ts";
import { DiscordChannel } from "@/gateway/channels/discord-channel.ts";
import { SlackChannel } from "@/gateway/channels/slack-channel.ts";
import { TelegramChannel } from "@/gateway/channels/telegram/telegram-channel.ts";
import { WebChannel } from "@/gateway/channels/web/web-channel.ts";

export interface ConfiguredChannelSet {
	channels: Channel[];
	unsupportedEnabled: string[];
	misconfiguredEnabled: string[];
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

function hasText(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

export function createConfiguredChannels(config: Config): ConfiguredChannelSet {
	const channels: Channel[] = [];
	const unsupportedEnabled: string[] = [];
	const misconfiguredEnabled: string[] = [];
	const skippedAgentChannels: string[] = [];

	if (config.channels.web?.enabled !== false) {
		channels.push(new WebChannel());
	}

	if (config.channels.telegram.enabled) {
		if (hasText(config.channels.telegram.token)) {
			channels.push(new TelegramChannel(config.channels.telegram.token));
			if (shouldSkipTelegramAgentTurns()) skippedAgentChannels.push("telegram");
		} else {
			misconfiguredEnabled.push("telegram: missing token");
		}
	}

	if (config.channels.discord.enabled) {
		if (hasText(config.channels.discord.token)) {
			channels.push(new DiscordChannel(config.channels.discord));
		} else {
			misconfiguredEnabled.push("discord: missing token");
		}
	}

	if (config.channels.slack.enabled) {
		if (
			hasText(config.channels.slack.bot_token) &&
			hasText(config.channels.slack.app_token)
		) {
			channels.push(new SlackChannel(config.channels.slack));
		} else {
			misconfiguredEnabled.push("slack: missing bot_token or app_token");
		}
	}

	for (const name of CONFIGURED_CHANNEL_NAMES) {
		if (["telegram", "discord", "slack"].includes(name)) continue;
		if (isEnabled(config.channels[name])) unsupportedEnabled.push(name);
	}

	return {
		channels,
		unsupportedEnabled,
		misconfiguredEnabled,
		skippedAgentChannels,
	};
}
