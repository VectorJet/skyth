export interface ChannelDescriptor {
	id: string;
	label: string;
	configKey?: string;
	pluginOnly?: boolean;
}

export const CHANNELS: ChannelDescriptor[] = [
	{ id: "skip", label: "Skip for now" },
	{ id: "telegram", label: "Telegram", configKey: "telegram" },
	{ id: "whatsapp", label: "WhatsApp (default)", configKey: "whatsapp" },
	{ id: "discord", label: "Discord", configKey: "discord" },
	{ id: "google_chat", label: "Google Chat", pluginOnly: true },
	{ id: "slack", label: "Slack", configKey: "slack" },
	{ id: "signal", label: "Signal", pluginOnly: true },
	{ id: "imessage", label: "iMessage", pluginOnly: true },
	{ id: "nostr", label: "Nostr", pluginOnly: true },
	{ id: "microsoft_teams", label: "Microsoft Teams", pluginOnly: true },
	{ id: "mattermost", label: "Mattermost", pluginOnly: true },
	{ id: "nextcloud_talk", label: "Nextcloud Talk", pluginOnly: true },
	{ id: "matrix", label: "Matrix", pluginOnly: true },
	{ id: "line", label: "LINE", pluginOnly: true },
	{ id: "zalo", label: "Zalo", pluginOnly: true },
	{ id: "email", label: "Email", configKey: "email" },
];
