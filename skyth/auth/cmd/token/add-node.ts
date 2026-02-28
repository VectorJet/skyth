import { strFlag } from "@/cli/runtime_helpers";
import { addNode, hasDeviceToken, getDeviceTokenInfo } from "./shared";
import { waitForPairing, startPairingEndpoint } from "./pairing-http";
import { loadConfig } from "@/config/loader";
import { MessageBus } from "@/bus/queue";
import { DiscordChannel } from "@/channels/discord";
import { TelegramChannel } from "@/channels/telegram";
import { SlackChannel } from "@/channels/slack";
import { WhatsAppChannel } from "@/channels/whatsapp";
import type { BaseChannel } from "@/channels/base";

const CHANNEL_CREDENTIALS: Record<string, { enabled: string; credential: string }> = {
  discord: { enabled: "gateway_url", credential: "token" },
  telegram: { enabled: "token", credential: "token" },
  slack: { enabled: "bot_token", credential: "bot_token" },
  whatsapp: { enabled: "bridge_url", credential: "bridge_url" },
};

function createChannelAdapter(channel: string, config: any, bus: MessageBus): (BaseChannel & { setPairingEndpoint(url: string | null): void }) | null {
  switch (channel) {
    case "discord": return new DiscordChannel(config, bus);
    case "telegram": return new TelegramChannel(config, bus);
    case "slack": return new SlackChannel(config, bus);
    case "whatsapp": return new WhatsAppChannel(config, bus);
    default: return null;
  }
}

function checkChannelConfigured(channel: string): { configured: boolean; message: string } {
  const cfg = loadConfig();
  const channelConfig = (cfg.channels as any)[channel];

  if (!channelConfig) {
    return { configured: false, message: `Channel '${channel}' is not recognized.` };
  }

  const creds = CHANNEL_CREDENTIALS[channel];
  if (!creds) {
    return { configured: true, message: "" };
  }

  const enabled = channelConfig.enabled;
  const credential = channelConfig[creds.credential];
  const hasCredential = typeof credential === "string" && credential.trim().length > 0;

  if (!enabled) {
    return { configured: false, message: `Channel '${channel}' is not enabled. Run: skyth configure channel ${channel}` };
  }

  if (!hasCredential) {
    return { configured: false, message: `Channel '${channel}' is not configured with credentials. Run: skyth configure channel ${channel}` };
  }

  return { configured: true, message: "" };
}

export async function addNodeCommandHandler(args: string[], passedFlags?: Record<string, string | boolean>): Promise<number> {
  if (!hasDeviceToken()) {
    console.error("Error: No device token exists.");
    console.log("Create one with: skyth auth token create");
    return 1;
  }

  const flags = passedFlags || {};
  const channel = strFlag(flags, "channel");
  const timeoutStr = strFlag(flags, "timeout");
  const timeoutMs = timeoutStr ? Number(timeoutStr) * 1000 : 120000;

  if (!channel) {
    console.error("Error: --channel is required.");
    console.log("Usage: skyth auth token add-node --channel telegram [--timeout 120]");
    return 1;
  }

  const check = checkChannelConfigured(channel);
  if (!check.configured) {
    console.error(`Error: ${check.message}`);
    return 1;
  }

  const tokenInfo = getDeviceTokenInfo();
  if (!tokenInfo) {
    console.error("Error: Device token not found.");
    return 1;
  }

  console.log(`Starting pairing for channel: ${channel}`);
  console.log("");

  const cfg = loadConfig();
  const bus = new MessageBus();
  const channelConfig = (cfg.channels as any)[channel];
  const adapter = createChannelAdapter(channel, channelConfig, bus);

  try {
    const { code, url, close } = await startPairingEndpoint(channel, timeoutMs);

    if (adapter) {
      adapter.setPairingEndpoint(url);
      await adapter.start();
    }

    console.log(`Pairing code: ${code}`);
    console.log(`Send this code from your ${channel} to pair your device.`);
    console.log(`Waiting up to ${Math.round(timeoutMs / 1000)} seconds...`);
    console.log("");

    const result = await waitForPairing(channel, timeoutMs);

    if (adapter) await adapter.stop().catch(() => {});
    await close();

    if (result.success) {
      console.log("Channel paired successfully!");
      console.log(`Node ID:    ${result.nodeId}`);
      if (result.nodeToken) {
        console.log("Node token stored securely.");
      }
      return 0;
    } else {
      console.error(`Pairing failed: ${result.error}`);
      return 1;
    }
  } catch (error) {
    if (adapter) await adapter.stop().catch(() => {});
    console.error(`Error during pairing: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}
