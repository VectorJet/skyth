import type { OnboardingStepManifest, StepContext, StepResult } from "@/cli/cmd/onboarding/module/steps/registry";
import { hasDeviceToken, addNode } from "@/auth/cmd/token/shared";
import { PairingManager } from "@/auth/cmd/token/pairing-manager";
import { loadConfig } from "@/config/loader";
import { MessageBus } from "@/bus/queue";
import { DiscordChannel } from "@/channels/discord";
import { TelegramChannel } from "@/channels/telegram";
import { SlackChannel } from "@/channels/slack";
import { WhatsAppChannel } from "@/channels/whatsapp";
import type { BaseChannel } from "@/channels/base";

const CHANNELS_THAT_SUPPORT_PAIRING = ["telegram", "discord", "slack", "whatsapp"];

async function handleChannelPairing(
  channel: string,
  clackNote: (msg: string, title?: string) => void,
  consoleLog: (msg: string) => void,
): Promise<{ paired: boolean; senderId?: string }> {
  if (!hasDeviceToken()) {
    return { paired: false };
  }

  if (!CHANNELS_THAT_SUPPORT_PAIRING.includes(channel)) {
    return { paired: false };
  }

  const pairingManager = new PairingManager();
  let adapter: (BaseChannel & { setPairingEndpoint(url: string | null): void }) | null = null;
  
  try {
    const { code, url } = await pairingManager.start(channel, 120000);

    const cfg = loadConfig();
    const channelConfig = (cfg.channels as any)[channel];
    const bus = new MessageBus();
    switch (channel) {
      case "discord": adapter = new DiscordChannel(channelConfig, bus); break;
      case "telegram": adapter = new TelegramChannel(channelConfig, bus); break;
      case "slack": adapter = new SlackChannel(channelConfig, bus); break;
      case "whatsapp": adapter = new WhatsAppChannel(channelConfig, bus); break;
    }
    if (adapter) {
      adapter.setPairingEndpoint(url);
      await adapter.start();
    }

    const noteMsg = "Pairing code: " + code + "\n" +
      "Send this code from your " + channel + " chat to pair your device.\n" +
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

      clackNote("Successfully paired!\nSender ID:  " + result.senderId + "\nNode token stored securely.", "Pairing Complete");
      consoleLog("Successfully paired!");
      consoleLog("Sender ID:  " + result.senderId);
      consoleLog("Node token stored securely.\n");
      
      return { paired: true, senderId: result.senderId };
    } else {
      const failedMsg = "Pairing timed out or failed. You can pair later with: skyth auth token add-node --channel " + channel;
      clackNote(failedMsg, "Pairing");
      consoleLog("Pairing timed out or failed.");
      consoleLog("You can pair later with: skyth auth token add-node --channel " + channel + "\n");
      return { paired: false };
    }
  } finally {
    if (adapter) await adapter.stop().catch(() => {});
    await pairingManager.stop();
  }
}

export const STEP_MANIFEST: OnboardingStepManifest = {
  id: "channel-selection",
  name: "Channel Selection",
  description: "Select and configure messaging channels",
  order: 60,
  group: "channels",
};

export interface ChannelDescriptor {
  id: string;
  label: string;
  configKey?: string;
  pluginOnly?: boolean;
}

const CHANNELS: ChannelDescriptor[] = [
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

export async function runChannelSelectionStep(ctx: StepContext): Promise<StepResult> {
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
      notices: [`${channelEntry.label} requires plugin install before channel onboarding.`],
      patches: [],
    };
  }

  const patches: any[] = [];
  const notices: string[] = [];
  const channelConfig = channels[channelEntry.configKey || channelEntry.id] || {};

  if (channelEntry.id === "telegram") {
    const token = await clackSecretValue("Telegram bot token", channelConfig.token || "");
    if (token === undefined) {
      cancel("Onboarding cancelled.");
      return { cancelled: true, updates: {}, notices: [], patches: [] };
    }
    if (!token.trim()) {
      notices.push("Telegram not configured (token left empty).");
      return { cancelled: false, updates: {}, notices, patches: [] };
    }

    const pairNow = await clackConfirmValue("Pair Telegram user now? (recommended)", true);
    if (pairNow === undefined) {
      cancel("Onboarding cancelled.");
      return { cancelled: true, updates: {}, notices: [], patches: [] };
    }

    let allowFrom = normalizeAllowFrom(channelConfig.allow_from);

    if (pairNow) {
      const pairingResult = await handleChannelPairing(
        "telegram",
        (msg, title) => note(msg, title),
        (msg) => console.log(msg),
      );

      if (pairingResult.paired && pairingResult.senderId) {
        if (!allowFrom.includes(pairingResult.senderId)) {
          allowFrom = [...allowFrom, pairingResult.senderId];
        }
        notices.push(`Telegram paired user ${pairingResult.senderId}. Added to allowlist.`);
      } else {
        notices.push("Telegram pairing timed out or skipped.");
      }
    }

    patches.push({
      channel: "telegram",
      values: { enabled: true, token: token.trim(), allow_from: allowFrom },
    });
    notices.push("Telegram configured.");
  }

  if (channelEntry.id === "whatsapp") {
    const bridgeUrl = await clackTextValue("WhatsApp bridge URL", channelConfig.bridge_url || "ws://localhost:3001");
    if (bridgeUrl === undefined) {
      cancel("Onboarding cancelled.");
      return { cancelled: true, updates: {}, notices: [], patches: [] };
    }
    const bridgeToken = await clackSecretValue("WhatsApp bridge token (optional)", channelConfig.bridge_token || "");

    const pairNow = await clackConfirmValue("Pair WhatsApp now? (recommended)", true);
    if (pairNow) {
      const pairingResult = await handleChannelPairing(
        "whatsapp",
        (msg, title) => note(msg, title),
        (msg) => console.log(msg),
      );

      if (pairingResult.paired && pairingResult.senderId) {
        notices.push(`WhatsApp paired! Sender ID: ${pairingResult.senderId}`);
      }
    }

    patches.push({
      channel: "whatsapp",
      values: { enabled: true, bridge_url: bridgeUrl.trim(), bridge_token: bridgeToken?.trim() || "" },
    });
    notices.push("WhatsApp configured.");
  }

  if (channelEntry.id === "discord") {
    const token = await clackSecretValue("Discord bot token", channelConfig.token || "");
    if (token === undefined) {
      cancel("Onboarding cancelled.");
      return { cancelled: true, updates: {}, notices: [], patches: [] };
    }
    if (!token.trim()) {
      notices.push("Discord not configured (token left empty).");
      return { cancelled: false, updates: {}, notices, patches: [] };
    }

    const pairNow = await clackConfirmValue("Pair Discord now? (recommended)", true);
    if (pairNow) {
      const pairingResult = await handleChannelPairing(
        "discord",
        (msg, title) => note(msg, title),
        (msg) => console.log(msg),
      );

      if (pairingResult.paired && pairingResult.senderId) {
        notices.push(`Discord paired! Sender ID: ${pairingResult.senderId}`);
      }
    }

    patches.push({ channel: "discord", values: { enabled: true, token: token.trim() } });
    notices.push("Discord configured.");
  }

  if (channelEntry.id === "slack") {
    const botToken = await clackSecretValue("Slack bot token", channelConfig.bot_token || "");
    if (botToken === undefined) {
      cancel("Onboarding cancelled.");
      return { cancelled: true, updates: {}, notices: [], patches: [] };
    }
    const appToken = await clackSecretValue("Slack app token (Socket Mode)", channelConfig.app_token || "");

    if (!botToken.trim()) {
      notices.push("Slack not configured (bot token left empty).");
      return { cancelled: false, updates: {}, notices, patches: [] };
    }

    const pairNow = await clackConfirmValue("Pair Slack now? (recommended)", true);
    if (pairNow) {
      const pairingResult = await handleChannelPairing(
        "slack",
        (msg, title) => note(msg, title),
        (msg) => console.log(msg),
      );

      if (pairingResult.paired && pairingResult.senderId) {
        notices.push(`Slack paired! Sender ID: ${pairingResult.senderId}`);
      }
    }

    patches.push({
      channel: "slack",
      values: { enabled: true, mode: "socket", bot_token: botToken.trim(), app_token: appToken?.trim() || "" },
    });
    notices.push("Slack configured.");
  }

  if (channelEntry.id === "email") {
    notices.push("Email setup requires additional mail server fields. Configure ~/.skyth/channels/email.json manually.");
  }

  return { cancelled: false, updates: {}, notices, patches };
}
