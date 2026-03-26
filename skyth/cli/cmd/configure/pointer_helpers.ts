const CHANNEL_FIELD_LABELS: Record<string, Record<string, string>> = {
  telegram: { token: "Bot token", allow_from: "Allowed user IDs (comma-separated)" },
  discord: { token: "Bot token", gateway_url: "Gateway URL" },
  whatsapp: { bridge_url: "Bridge URL", bridge_token: "Bridge token" },
  slack: { bot_token: "Bot token (xoxb-...)", app_token: "App token (xapp-...)" },
  email: {
    imap_host: "IMAP host",
    imap_port: "IMAP port",
    imap_user: "IMAP user",
    imap_password: "IMAP password",
    smtp_host: "SMTP host",
    smtp_port: "SMTP port",
    smtp_user: "SMTP user",
    smtp_password: "SMTP password",
  },
};

export function formatChannelFieldLabels(channel: string): Record<string, string> {
  return CHANNEL_FIELD_LABELS[channel] ?? {};
}

export function getSupportedPairingChannels(): string[] {
  return ["telegram", "discord", "slack", "whatsapp"];
}