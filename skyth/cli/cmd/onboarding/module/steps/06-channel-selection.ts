import type {
	OnboardingStepManifest,
	StepContext,
	StepResult,
} from "@/cli/cmd/onboarding/module/steps/registry";
import {
	CHANNELS,
	type ChannelDescriptor,
} from "./channel_selection/constants";
import {
	generateTelegramPairingCode,
	waitForTelegramPairing,
} from "@/cli/cmd/onboarding/module/telegram_pairing";

export const STEP_MANIFEST: OnboardingStepManifest = {
	id: "channel-selection",
	name: "Channel Selection",
	description: "Select and configure messaging channels",
	order: 60,
	group: "channels",
};

function channelByID(id: string): ChannelDescriptor | undefined {
	return CHANNELS.find((channel) => channel.id === id);
}

function normalizeAllowFrom(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const out: string[] = [];
	for (const item of value) {
		const text = String(item ?? "").trim();
		if (!text) continue;
		if (!out.includes(text)) out.push(text);
	}
	return out;
}

export async function runChannelSelectionStep(
	ctx: StepContext,
): Promise<StepResult> {
	const {
		clackAutocompleteValue,
		clackTextValue,
		clackSecretValue,
		clackConfirmValue,
		clackCancel: cancel,
		clackNote: note,
	} = await import("../clack_helpers");

	const channels = ctx.cfg.channels as Record<string, any>;

	note(
		[
			`Gateway port: ${ctx.cfg.gateway?.port || 18790}`,
			"Gateway bind: loopback",
			"Gateway auth: token",
			"Tailscale exposure: off",
			"Direct to configured channels.",
		].join("\n"),
		"QuickStart",
	);

	const channelChoice = await clackAutocompleteValue(
		"Select channel (QuickStart)",
		CHANNELS.map((entry) => ({ value: entry.id, label: entry.label })),
		"skip",
	);

	if (!channelChoice) {
		cancel("Onboarding cancelled.");
		return { cancelled: true, updates: {}, notices: [], patches: [] };
	}

	const channelEntry = channelByID(channelChoice);
	if (!channelEntry || channelEntry.id === "skip") {
		return { cancelled: false, updates: {}, notices: [], patches: [] };
	}

	if (channelEntry.pluginOnly) {
		return {
			cancelled: false,
			updates: {},
			notices: [
				`${channelEntry.label} requires plugin install before channel onboarding.`,
			],
			patches: [],
		};
	}

	const patches: any[] = [];
	const notices: string[] = [];
	const channelConfig =
		channels[channelEntry.configKey || channelEntry.id] || {};

	if (channelEntry.id === "telegram") {
		const token = await clackSecretValue(
			"Telegram bot token",
			channelConfig.token || "",
		);
		if (token === undefined) {
			cancel("Onboarding cancelled.");
			return { cancelled: true, updates: {}, notices: [], patches: [] };
		}
		if (!token.trim()) {
			notices.push("Telegram not configured (token left empty).");
			return { cancelled: false, updates: {}, notices, patches: [] };
		}

		const pairNow = await clackConfirmValue(
			"Pair Telegram user now? (recommended)",
			true,
		);
		if (pairNow === undefined) {
			cancel("Onboarding cancelled.");
			return { cancelled: true, updates: {}, notices: [], patches: [] };
		}

		let allowFrom = normalizeAllowFrom(channelConfig.allow_from);

		if (pairNow) {
			const code = generateTelegramPairingCode();
			note(
				[
					`Pairing code: ${code}`,
					"Send this code to your Telegram bot.",
					"Waiting up to 2 minutes...",
				].join("\n"),
				"Telegram Pairing",
			);
			const pairing = await waitForTelegramPairing({
				token: token.trim(),
				code,
				timeoutMs: 120_000,
			});
			if (pairing.status === "paired" && pairing.senderId) {
				if (!allowFrom.includes(pairing.senderId)) {
					allowFrom = [...allowFrom, pairing.senderId];
				}
				notices.push(
					`Telegram paired user ${pairing.senderId}. Added to allowlist.`,
				);
			} else {
				notices.push("Telegram pairing timed out or failed.");
			}
		}

		patches.push({
			channel: "telegram",
			values: { enabled: true, token: token.trim(), allow_from: allowFrom },
		});
		notices.push("Telegram configured.");
	}

	if (channelEntry.id === "whatsapp") {
		const bridgeUrl = await clackTextValue(
			"WhatsApp bridge URL",
			channelConfig.bridge_url || "ws://localhost:3001",
		);
		if (bridgeUrl === undefined) {
			cancel("Onboarding cancelled.");
			return { cancelled: true, updates: {}, notices: [], patches: [] };
		}
		const bridgeToken = await clackSecretValue(
			"WhatsApp bridge token (optional)",
			channelConfig.bridge_token || "",
		);

		patches.push({
			channel: "whatsapp",
			values: {
				enabled: true,
				bridge_url: bridgeUrl.trim(),
				bridge_token: bridgeToken?.trim() || "",
			},
		});
		notices.push("WhatsApp configured.");
	}

	if (channelEntry.id === "discord") {
		const token = await clackSecretValue(
			"Discord bot token",
			channelConfig.token || "",
		);
		if (token === undefined) {
			cancel("Onboarding cancelled.");
			return { cancelled: true, updates: {}, notices: [], patches: [] };
		}
		if (!token.trim()) {
			notices.push("Discord not configured (token left empty).");
			return { cancelled: false, updates: {}, notices, patches: [] };
		}

		patches.push({
			channel: "discord",
			values: { enabled: true, token: token.trim() },
		});
		notices.push("Discord configured.");
	}

	if (channelEntry.id === "slack") {
		const botToken = await clackSecretValue(
			"Slack bot token",
			channelConfig.bot_token || "",
		);
		if (botToken === undefined) {
			cancel("Onboarding cancelled.");
			return { cancelled: true, updates: {}, notices: [], patches: [] };
		}
		const appToken = await clackSecretValue(
			"Slack app token (Socket Mode)",
			channelConfig.app_token || "",
		);

		if (!botToken.trim()) {
			notices.push("Slack not configured (bot token left empty).");
			return { cancelled: false, updates: {}, notices, patches: [] };
		}

		patches.push({
			channel: "slack",
			values: {
				enabled: true,
				mode: "socket",
				bot_token: botToken.trim(),
				app_token: appToken?.trim() || "",
			},
		});
		notices.push("Slack configured.");
	}

	if (channelEntry.id === "email") {
		notices.push(
			"Email setup requires additional mail server fields. Configure ~/.skyth/channels/email.json manually.",
		);
	}

	return { cancelled: false, updates: {}, notices, patches };
}
