import type { ConfigureTopicManifest, ConfigureHandler, ConfigureHandlerArgs } from "@/cli/cmd/configure/registry";
import type { ConfigureArgs, ConfigureDeps } from "@/cli/cmd/configure/index";
import { isKnownChannel, knownChannelsText } from "@/cli/cmd/configure/../channels/utils";
import { requireSuperuserForConfiguredChannel } from "@/cli/cmd/configure/../channels";
import { channelsEditCommand } from "@/cli/cmd/configure/../channels/edit";
import { CHANNEL_SECRET_PATHS } from "@/cli/cmd/configure/../../../auth/secret_store";
import { hasDeviceToken, addNode } from "@/auth/cmd/token/shared";
import { PairingManager } from "@/auth/cmd/token/pairing-manager";
import { promptInput } from "@/cli/runtime_helpers";
import { loadConfig } from "@/config/loader";
import { MessageBus } from "@/bus/queue";
import { DiscordChannel } from "@/channels/discord";
import { TelegramChannel } from "@/channels/telegram";
import { SlackChannel } from "@/channels/slack";
import { WhatsAppChannel } from "@/channels/whatsapp";
import type { BaseChannel } from "@/channels/base";
import {
  select as clackSelect,
  cancel as clackCancel,
  confirm as clackConfirm,
  isCancel,
  password as clackPassword,
  text as clackText,
  note as clackNote,
} from "@clack/prompts";
import { registry } from "@/cli/cmd/configure/registry";

export const MANIFEST: ConfigureTopicManifest = {
  id: "channel",
  aliases: ["channels"],
  description: "Configure a channel",
  requiresAuth: true,
};

const CHANNEL_FIELD_LABELS: Record<string, Record<string, string>> = {
  telegram: { token: "Bot token", allow_from: "Allowed user IDs (comma-separated)" },
  discord: { token: "Bot token", gateway_url: "Gateway URL" },
  whatsapp: { bridge_url: "Bridge URL", bridge_token: "Bridge token" },
  slack: { bot_token: "Bot token (xoxb-...)", app_token: "App token (xapp-...)" },
  email: { imap_host: "IMAP host", imap_port: "IMAP port", imap_user: "IMAP user", imap_password: "IMAP password", smtp_host: "SMTP host", smtp_port: "SMTP port", smtp_user: "SMTP user", smtp_password: "SMTP password" },
};

async function handler({ args, deps, useClack }: ConfigureHandlerArgs): Promise<{ exitCode: number; output: string }> {
  let channel = (args.channel ?? args.value ?? "").trim().toLowerCase();

  if (!channel && useClack) {
    const channelNames = Object.keys(CHANNEL_FIELD_LABELS);
    const choice = await clackSelect<string>({
      message: "Select channel to configure",
      options: channelNames.map((name) => ({ value: name, label: name })),
    });
    if (isCancel(choice)) return { exitCode: 1, output: "Cancelled." };
    channel = String(choice ?? "").trim();
  }
  if (!channel && !useClack) {
    channel = (await deps.promptInputFn(`Channel (${knownChannelsText()}): `)).trim().toLowerCase();
  }
  if (!channel) return { exitCode: 1, output: "Error: channel name is required." };
  if (!isKnownChannel(channel)) {
    return { exitCode: 1, output: `Error: unknown channel '${channel}'. Available: ${knownChannelsText()}` };
  }

  const askPassword = useClack
    ? async (msg: string) => {
        const v = await clackPassword({ message: msg, mask: "*" });
        return isCancel(v) ? "" : String(v ?? "");
      }
    : deps.promptInputFn;

  const gate = await requireSuperuserForConfiguredChannel(channel, {
    promptPasswordFn: askPassword,
  });
  if (!gate.allowed) {
    if (useClack) clackCancel(gate.reason ?? "Authorization required.");
    return { exitCode: 1, output: gate.reason ?? "Authorization required." };
  }

  if (args.json || args.set || args.enable || args.disable) {
    const result = channelsEditCommand({
      channel,
      enable: args.enable,
      disable: args.disable,
      set: args.set,
      json: args.json,
    });
    return result;
  }

  const fields = CHANNEL_FIELD_LABELS[channel] ?? {};
  const secretPaths = new Set(CHANNEL_SECRET_PATHS[channel] ?? []);
  const patch: Record<string, any> = {};

  for (const [key, label] of Object.entries(fields)) {
    const isSecret = secretPaths.has(key);
    let value: string | undefined;
    if (useClack) {
      const raw = isSecret
        ? await clackPassword({ message: label, mask: "*" })
        : await clackText({ message: `${label} (leave blank to skip)` });
      if (isCancel(raw)) return { exitCode: 1, output: "Cancelled." };
      value = String(raw ?? "").trim();
    } else {
      value = (await deps.promptInputFn(`${label}: `)).trim();
    }
    if (value) patch[key] = value;
  }

  if (useClack) {
    const shouldEnable = await clackConfirm({ message: "Enable this channel?", initialValue: true });
    if (isCancel(shouldEnable)) return { exitCode: 1, output: "Cancelled." };
    patch.enabled = shouldEnable;
  } else {
    const answer = (await deps.promptInputFn("Enable this channel? (y/n): ")).trim().toLowerCase();
    patch.enabled = answer === "y" || answer === "yes";
  }

  if (Object.keys(patch).length === 0) {
    return { exitCode: 0, output: `No changes for channel '${channel}'.` };
  }

  const result = channelsEditCommand({
    channel,
    json: JSON.stringify(patch),
  });

  if (result.exitCode !== 0) {
    return result;
  }

  if (!patch.enabled) {
    return result;
  }

  const supportsPairing = ["telegram", "discord", "slack", "whatsapp"].includes(channel);
  
  if (supportsPairing && hasDeviceToken()) {
    let doPair = true;
    
    if (useClack) {
      const shouldPair = await clackConfirm({ 
        message: `Pair ${channel} now? (REQUIRED - you must send a pairing code from your ${channel} chat)`,
        initialValue: true 
      });
      if (isCancel(shouldPair)) {
        return { exitCode: 1, output: "Pairing is required. Configuration cancelled." };
      }
      doPair = shouldPair;
    } else {
      const answer = (await deps.promptInputFn("Pair " + channel + " now? (REQUIRED - you must send a pairing code from your " + channel + " chat) (y/n): ")).trim().toLowerCase();
      doPair = answer === "y" || answer === "yes";
    }

    if (!doPair) {
      return { exitCode: 1, output: "Pairing is required for channel configuration." };
    }

    if (doPair) {
      const pairingManager = new PairingManager();
      let adapter: (BaseChannel & { setPairingEndpoint(url: string | null): void }) | null = null;
      
      try {
        if (useClack) {
          clackNote([
            `Starting ${channel} pairing...`,
            `You'll need to send a pairing code from your ${channel} chat.`,
          ].join("\n"), "Pairing");
        } else {
          console.log(`\nStarting ${channel} pairing...`);
          console.log(`You'll need to send a pairing code from your ${channel} chat.`);
        }

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

        if (useClack) {
          clackNote([
            `Pairing code: ${code}`,
            `Send this code from your ${channel} to pair your device.`,
            `Waiting up to 2 minutes...`,
          ].join("\n"), "Pairing Code");
        } else {
          console.log(`\nPairing code: ${code}`);
          console.log(`Send this code from your ${channel} to pair your device.`);
          console.log("Waiting up to 2 minutes...");
        }

        const pairingResult = await pairingManager.awaitResult(120000);

        if (adapter) await adapter.stop().catch(() => {});

        if (pairingResult.status === "paired" && pairingResult.senderId) {
          const node = addNode(channel, pairingResult.senderId, {
            ...pairingResult.metadata,
            configured_at: new Date().toISOString(),
          });

          if (useClack) {
            clackNote([
              `Successfully paired!`,
              `Sender ID:  ${pairingResult.senderId}`,
              "Node token stored securely.",
            ].join("\n"), "Pairing Complete");
          } else {
            console.log(`\nSuccessfully paired!`);
            console.log(`Sender ID:  ${pairingResult.senderId}`);
            console.log("Node token stored securely.");
          }
        } else {
          if (useClack) {
            clackNote(`Pairing timed out or failed. You can pair later with: skyth auth token add-node --channel ${channel}`, "Pairing");
          } else {
            console.log(`\nPairing timed out or failed.`);
            console.log(`You can pair later with: skyth auth token add-node --channel ${channel}`);
          }
        }
      } finally {
        if (adapter) await adapter.stop().catch(() => {});
        await pairingManager.stop();
      }
    }
  }

  return result;
}

export const topic = { manifest: MANIFEST, handler };
registry.register(topic);
