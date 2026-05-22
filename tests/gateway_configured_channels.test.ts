import { describe, expect, test } from "bun:test";
import { Config } from "@/config/schema";
import { createConfiguredChannels } from "@/gateway/channels/configured";

function channelNames(config: Config): string[] {
	return createConfiguredChannels(config).channels.map(
		(channel) => channel.name,
	);
}

describe("createConfiguredChannels", () => {
	test("always includes the web channel unless disabled", () => {
		const config = new Config();
		expect(channelNames(config)).toContain("web");

		config.channels.web.enabled = false;
		expect(channelNames(config)).not.toContain("web");
	});

	test("registers enabled concrete gateway adapters from hydrated config", () => {
		const config = new Config();
		config.channels.telegram.enabled = true;
		config.channels.telegram.token = "telegram-token-from-quasar";
		config.channels.discord.enabled = true;
		config.channels.discord.token = "discord-token-from-quasar";
		config.channels.slack.enabled = true;
		config.channels.slack.bot_token = "slack-bot-token-from-quasar";
		config.channels.slack.app_token = "slack-app-token-from-quasar";

		expect(channelNames(config)).toEqual([
			"web",
			"telegram",
			"discord",
			"slack",
		]);
	});

	test("reports enabled channels that do not have current gateway adapters", () => {
		const config = new Config();
		config.channels.whatsapp.enabled = true;
		config.channels.email.enabled = true;

		const configured = createConfiguredChannels(config);
		expect(configured.unsupportedEnabled.sort()).toEqual(["email", "whatsapp"]);
	});

	test("keeps externally handled telegram bridge out of the agent loop", () => {
		const envSnapshot = { ...process.env };
		process.env.CLAUDE_GATEWAY_TELEGRAM_POLLING = "0";
		try {
			const config = new Config();
			config.channels.telegram.enabled = true;
			const configured = createConfiguredChannels(config);
			expect(configured.skippedAgentChannels).toEqual(["telegram"]);
		} finally {
			for (const key of Object.keys(process.env)) {
				if (!(key in envSnapshot)) delete process.env[key];
			}
			Object.assign(process.env, envSnapshot);
		}
	});
});
