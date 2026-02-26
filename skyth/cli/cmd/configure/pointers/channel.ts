import type { ConfigureTopicManifest, ConfigureHandler, ConfigureHandlerArgs } from "@/cli/cmd/configure/registry";
import type { ConfigureArgs, ConfigureDeps } from "@/cli/cmd/configure/index";
import { isKnownChannel, knownChannelsText } from "@/cli/cmd/configure/../channels/utils";
import { requireSuperuserForConfiguredChannel } from "@/cli/cmd/configure/../channels";
import { channelsEditCommand } from "@/cli/cmd/configure/../channels/edit";
import { CHANNEL_SECRET_PATHS } from "@/cli/cmd/configure/../../../auth/secret_store";
import { promptInput } from "@/cli/cmd/configure/../runtime_helpers";
import {
  select as clackSelect,
  cancel as clackCancel,
  confirm as clackConfirm,
  isCancel,
  password as clackPassword,
  text as clackText,
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
  feishu: { app_id: "App ID", app_secret: "App secret", encrypt_key: "Encrypt key", verification_token: "Verification token" },
  dingtalk: { client_id: "Client ID", client_secret: "Client secret" },
  mochat: { base_url: "Base URL", claw_token: "Claw token" },
  qq: { app_id: "App ID", secret: "Secret" },
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
  return result;
}

export const topic = { manifest: MANIFEST, handler };
registry.register(topic);
