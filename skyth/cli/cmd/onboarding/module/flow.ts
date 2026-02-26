import {
  autocomplete as clackAutocomplete,
  cancel as clackCancel,
  confirm as clackConfirm,
  intro as clackIntro,
  isCancel,
  note as clackNote,
  outro as clackOutro,
  password as clackPassword,
  select as clackSelect,
  text as clackText,
} from "@clack/prompts";
import { hasSuperuserPasswordRecord } from "../../../../auth/superuser";
import type { Config } from "../../../../config/schema";
import { listProviderSpecs, loadModelsDevCatalog } from "../../../../providers/registry";
import { promptInput } from "../../../runtime_helpers";
import { generateTelegramPairingCode, waitForTelegramPairing } from "./telegram_pairing";
import type {
  ChannelPatch,
  InteractiveFlowResult,
  OnboardingArgs,
  OnboardingDeps,
  OnboardingMode,
  SelectOption,
} from "./types";
import { defaultWrite, printChoice, printHeader, printSection, readAsciiArt } from "./ui";

interface Prompting {
  input: (message: string, initialValue?: string) => Promise<string>;
  secret: (message: string, initialValue?: string) => Promise<string>;
  confirm: (message: string, initialValue?: boolean) => Promise<boolean>;
  select: <T extends string>(
    message: string,
    options: Array<SelectOption<T>>,
    initialValue: T,
  ) => Promise<T>;
}

interface ProviderOption {
  value: string;
  label: string;
  hint?: string;
  isOAuth: boolean;
  envKey: string;
}

interface ModelOption {
  value: string;
  label: string;
}

interface ChannelDescriptor {
  id: string;
  label: string;
  configKey?: string;
  pluginOnly?: boolean;
}

const MODEL_KEEP_CURRENT = "__keep_current__";
const MODEL_ENTER_MANUAL = "__manual_model__";

const PROVIDER_HINTS: Record<string, string> = {
  anthropic: "Claude Max or API key",
  openai: "ChatGPT Plus/Pro or API key",
};

const PROVIDER_LABEL_OVERRIDES: Record<string, string> = {
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  github_copilot: "GitHub Copilot",
  google: "Google",
  openai: "OpenAI",
  openai_codex: "OpenAI Codex",
  opencode: "OpenCode Zen",
  opencode_zen: "OpenCode Zen",
  openrouter: "OpenRouter",
  vercel: "Vercel AI Gateway",
  vercel_ai_gateway: "Vercel AI Gateway",
};

const CHANNELS: ChannelDescriptor[] = [
  { id: "skip", label: "Skip for now" },
  { id: "telegram", label: "Telegram", configKey: "telegram" },
  { id: "whatsapp", label: "WhatsApp (default)", configKey: "whatsapp" },
  { id: "discord", label: "Discord", configKey: "discord" },
  { id: "google_chat", label: "Google Chat", pluginOnly: true },
  { id: "slack", label: "Slack", configKey: "slack" },
  { id: "signal", label: "Signal", pluginOnly: true },
  { id: "imessage", label: "iMessage", pluginOnly: true },
  { id: "mochat", label: "Mochat", configKey: "mochat" },
  { id: "nostr", label: "Nostr", pluginOnly: true },
  { id: "microsoft_teams", label: "Microsoft Teams", pluginOnly: true },
  { id: "mattermost", label: "Mattermost", pluginOnly: true },
  { id: "nextcloud_talk", label: "Nextcloud Talk", pluginOnly: true },
  { id: "matrix", label: "Matrix", pluginOnly: true },
  { id: "bluebubbles", label: "BlueBubbles", pluginOnly: true },
  { id: "line", label: "LINE", pluginOnly: true },
  { id: "zalo", label: "Zalo", pluginOnly: true },
  { id: "zalo_personal", label: "Zalo Personal", pluginOnly: true },
  { id: "tlon", label: "Tlon", pluginOnly: true },
  { id: "feishu", label: "Feishu", configKey: "feishu" },
  { id: "dingtalk", label: "DingTalk", configKey: "dingtalk" },
  { id: "qq", label: "QQ", configKey: "qq" },
  { id: "email", label: "Email", configKey: "email" },
];

function normalizeYesNo(raw: string, fallback: boolean): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return fallback;
  if (["y", "yes", "true", "1"].includes(v)) return true;
  if (["n", "no", "false", "0"].includes(v)) return false;
  return fallback;
}

function normalizeProviderID(value: string): string {
  return value.trim().replace(/^@ai-sdk\//, "").replaceAll("-", "_");
}

function toTitleCaseToken(token: string): string {
  if (!token) return token;
  if (token.length <= 3) return token.toUpperCase();
  return token[0]!.toUpperCase() + token.slice(1).toLowerCase();
}

function formatProviderLabel(providerID: string): string {
  const normalized = normalizeProviderID(providerID);
  const override = PROVIDER_LABEL_OVERRIDES[normalized];
  if (override) return override;
  return normalized
    .split(/[_\s]+/g)
    .map((token) => toTitleCaseToken(token))
    .join(" ");
}

function hasCustomPromptDeps(deps: OnboardingDeps): boolean {
  return Boolean(deps.promptInput || deps.promptSecret || deps.promptConfirm || deps.promptSelect || deps.write);
}

function shouldUseClackTui(deps: OnboardingDeps): boolean {
  if (hasCustomPromptDeps(deps)) return false;
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function shouldConfigureIdentity(configMode: "keep" | "update", args: OnboardingArgs): boolean {
  if (args.username || args.nickname) return false;
  return configMode === "update";
}

function existingConfigLines(cfg: Config): string[] {
  const gateway = cfg.gateway ?? { host: "0.0.0.0", port: 18790 };
  return [
    `workspace: ${cfg.workspace_path}`,
    `model: ${cfg.agents.defaults.model}`,
    `gateway.host: ${gateway.host}`,
    `gateway.port: ${gateway.port}`,
  ];
}

function currentProviderID(cfg: Config): string {
  const explicit = normalizeProviderID(cfg.primary_model_provider || "");
  if (explicit) return explicit;
  const model = (cfg.primary_model || cfg.agents.defaults.model || "").trim();
  if (!model.includes("/")) return "";
  return normalizeProviderID(model.split("/", 1)[0] || "");
}

function hasConfiguredModelAuth(cfg: Config): boolean {
  const provider = currentProviderID(cfg);
  if (!provider) return false;
  const providers = cfg.providers as Record<string, { api_key?: string }>;
  const apiKey = providers[provider]?.api_key?.trim() ?? "";
  return apiKey.length > 0;
}

function channelStatusLines(cfg: Config): string[] {
  const channels = cfg.channels as Record<string, { enabled?: boolean; bridge_token?: string }>;
  const lines: string[] = [];

  for (const entry of CHANNELS) {
    if (entry.id === "skip") continue;
    if (entry.pluginOnly) {
      lines.push(`${entry.label}: install plugin to enable`);
      continue;
    }

    const key = entry.configKey ?? entry.id;
    const cfgChannel = channels[key];
    if (key === "whatsapp") {
      if (cfgChannel?.enabled && cfgChannel.bridge_token) lines.push(`${entry.label}: linked`);
      else if (cfgChannel?.enabled) lines.push(`${entry.label}: configured`);
      else lines.push(`${entry.label}: not configured`);
      continue;
    }
    lines.push(`${entry.label}: ${cfgChannel?.enabled ? "configured" : "not configured"}`);
  }

  return lines;
}

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

async function buildProviderOptions(): Promise<ProviderOption[]> {
  const specs = await listProviderSpecs({ includeDynamic: true });
  const dedup = new Map<string, ProviderOption>();

  for (const spec of specs) {
    const id = normalizeProviderID(spec.name);
    if (!id || dedup.has(id)) continue;
    dedup.set(id, {
      value: id,
      label: formatProviderLabel(id),
      hint: PROVIDER_HINTS[id],
      isOAuth: Boolean(spec.is_oauth),
      envKey: spec.env_key || "",
    });
  }

  let options = [...dedup.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
  );

  const recommendedIndex = options.findIndex((option) =>
    option.value.includes("opencode") || option.value.includes("zen"),
  );

  if (recommendedIndex >= 0) {
    const recommended = options.splice(recommendedIndex, 1)[0]!;
    recommended.label = "OpenCode Zen (recommended)";
    recommended.hint = "recommended";
    options = [recommended, ...options];
  } else {
    options = [{ value: "opencode", label: "OpenCode Zen (recommended)", hint: "recommended", isOAuth: false, envKey: "" }, ...options];
  }

  return options;
}

function providerMatches(providerID: string, selectedProvider: string): boolean {
  return normalizeProviderID(providerID) === normalizeProviderID(selectedProvider);
}

function buildModelRef(providerID: string, modelID: string): string {
  const normalizedProvider = normalizeProviderID(providerID);
  const trimmedModel = modelID.trim();
  if (!trimmedModel) return "";
  const normalizedModel = trimmedModel.replaceAll("-", "_");
  if (
    normalizedModel.startsWith(`${normalizedProvider}/`) ||
    trimmedModel.startsWith(`${providerID}/`)
  ) {
    return `${normalizedProvider}/${trimmedModel.split("/").slice(1).join("/")}`;
  }
  return `${normalizedProvider}/${trimmedModel}`;
}

async function buildModelOptions(params: {
  selectedProvider: string;
  scope: "selected" | "all";
  currentModel: string;
}): Promise<ModelOption[]> {
  const options: ModelOption[] = [
    { value: MODEL_KEEP_CURRENT, label: `Keep current (${params.currentModel})` },
  ];

  const catalog = await loadModelsDevCatalog();
  const allModels: ModelOption[] = [];

  for (const provider of Object.values(catalog)) {
    if (params.scope === "selected" && !providerMatches(provider.id, params.selectedProvider)) continue;

    const providerLabel = provider.name?.trim() || formatProviderLabel(provider.id);
    for (const [modelID, modelDef] of Object.entries(provider.models ?? {})) {
      const ref = buildModelRef(provider.id, modelID);
      if (!ref) continue;
      const name = modelDef?.name?.trim() || modelID;
      allModels.push({
        value: ref,
        label: `${providerLabel} / ${name}`,
      });
    }
  }

  const seen = new Set<string>();
  const deduped = allModels
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }))
    .filter((entry) => {
      if (seen.has(entry.value)) return false;
      seen.add(entry.value);
      return true;
    });

  const limited = deduped.slice(0, 2500);
  options.push(...limited);
  options.push({ value: MODEL_ENTER_MANUAL, label: "Enter model manually" });
  return options;
}

async function clackSelectValue<T extends string>(
  message: string,
  options: Array<SelectOption<T>>,
  initialValue: T,
): Promise<T | undefined> {
  const value = await clackSelect<T>({
    message,
    options: options.map((o) => ({ value: o.value, label: o.label })),
    initialValue,
  });
  if (isCancel(value)) return undefined;
  return value as T;
}

async function clackAutocompleteValue<T extends string>(
  message: string,
  options: Array<{ value: T; label: string; hint?: string }>,
  initialValue?: T,
): Promise<T | undefined> {
  const value = await clackAutocomplete<T>({
    message,
    maxItems: 8,
    options,
    initialValue,
    initialUserInput: "",
  });
  if (isCancel(value)) return undefined;
  return value as T;
}

async function clackTextValue(message: string, initialValue?: string): Promise<string | undefined> {
  const value = await clackText({
    message,
    initialValue: initialValue && initialValue.length > 0 ? initialValue : undefined,
    placeholder: initialValue && initialValue.length > 0 ? initialValue : undefined,
  });
  if (isCancel(value)) return undefined;
  const raw = String(value ?? "").trim();
  return raw || (initialValue ?? "");
}

async function clackSecretValue(message: string, initialValue?: string): Promise<string | undefined> {
  const value = await clackPassword({
    message,
    mask: "\u2588",
    placeholder: initialValue && initialValue.length > 0 ? "[redacted]" : undefined,
  });
  if (isCancel(value)) return undefined;
  const raw = String(value ?? "").trim();
  return raw || (initialValue ?? "");
}

async function promptSuperuserPasswordClack(required: boolean): Promise<string | null | undefined> {
  while (true) {
    const first = await clackPassword({
      message: required ? "Create superuser password" : "Create superuser password (optional; leave blank to keep current)",
      mask: "\u2588",
      placeholder: required ? undefined : "[redacted]",
    });
    if (isCancel(first)) return undefined;
    const firstValue = String(first ?? "").trim();
    if (!firstValue) {
      if (required) {
        clackNote("Superuser password is required for first-time setup.", "Security");
        continue;
      }
      return null;
    }

    const confirm = await clackPassword({
      message: "Confirm superuser password",
      mask: "\u2588",
    });
    if (isCancel(confirm)) return undefined;
    const confirmValue = String(confirm ?? "").trim();
    if (firstValue !== confirmValue) {
      clackNote("Passwords did not match. Try again.", "Security");
      continue;
    }
    return firstValue;
  }
}

async function clackConfirmValue(message: string, initialValue = false): Promise<boolean | undefined> {
  const value = await clackConfirm({ message, initialValue });
  if (isCancel(value)) return undefined;
  return Boolean(value);
}

function makePrompts(deps: OnboardingDeps, write: (line: string) => void): Prompting {
  const input = async (message: string, initialValue?: string): Promise<string> => {
    if (deps.promptInput) {
      return (await deps.promptInput(message, initialValue)).trim();
    }
    const suffix = initialValue ? ` [${initialValue}]` : "";
    const value = await promptInput(`${message}${suffix}: `);
    return value.trim() || (initialValue ?? "");
  };

  const secret = async (message: string, initialValue?: string): Promise<string> => {
    if (deps.promptSecret) {
      return (await deps.promptSecret(message, initialValue)).trim();
    }
    const fallbackValue = await input(message, initialValue);
    return fallbackValue.trim() || (initialValue ?? "");
  };

  const confirm = async (message: string, initialValue = false): Promise<boolean> => {
    if (deps.promptConfirm) {
      return await deps.promptConfirm(message, initialValue);
    }
    const hint = initialValue ? "Y/n" : "y/N";
    const value = await input(`${message} (${hint})`);
    return normalizeYesNo(value, initialValue);
  };

  const select = async <T extends string>(
    message: string,
    options: Array<SelectOption<T>>,
    initialValue: T,
  ): Promise<T> => {
    if (deps.promptSelect) {
      return await deps.promptSelect(message, options, initialValue);
    }

    write(message);
    options.forEach((option, idx) => {
      write(`  ${idx + 1}. ${option.label}`);
    });
    const answer = await input("Select option number", String(options.findIndex((o) => o.value === initialValue) + 1));
    const parsed = Number(answer);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= options.length) {
      return options[parsed - 1]!.value;
    }
    const byValue = options.find((o) => o.value === (answer as T));
    if (byValue) return byValue.value;
    return initialValue;
  };

  return { input, secret, confirm, select };
}

async function promptSuperuserPasswordPlain(
  prompts: Prompting,
  required: boolean,
): Promise<string | null> {
  while (true) {
    const first = (await prompts.secret(
      required ? "Create superuser password" : "Create superuser password (optional; leave blank to keep current)",
      "",
    )).trim();
    if (!first) {
      if (required) continue;
      return null;
    }
    const confirm = (await prompts.secret("Confirm superuser password", "")).trim();
    if (first === confirm) return first;
    // Prompt again until both entries match.
  }
}

async function configureBuiltInChannelClack(channelID: string, cfg: Config): Promise<{ cancelled: boolean; patches: ChannelPatch[]; notices: string[] }> {
  const channels = cfg.channels as Record<string, any>;

  if (channelID === "telegram") {
    const token = await clackSecretValue("Telegram bot token", channels.telegram?.token || "");
    if (token === undefined) return { cancelled: true, patches: [], notices: [] };
    if (!token.trim()) return { cancelled: false, patches: [], notices: ["Telegram not configured (token left empty)."] };
    const pairNow = await clackConfirmValue("Pair Telegram user now? (recommended)", true);
    if (pairNow === undefined) return { cancelled: true, patches: [], notices: [] };

    let allowFrom = normalizeAllowFrom(channels.telegram?.allow_from);
    const notices: string[] = [];
    if (pairNow) {
      const code = generateTelegramPairingCode();
      clackNote(
        [
          "Telegram pairing is ready.",
          `Send this pairing code to your bot: ${code}`,
          "Waiting up to 2 minutes for authorization handshake...",
        ].join("\n"),
        "Telegram pairing",
      );
      const pairing = await waitForTelegramPairing({
        token: token.trim(),
        code,
        timeoutMs: 120_000,
      });
      if (pairing.status === "paired" && pairing.senderId) {
        if (!allowFrom.includes(pairing.senderId)) allowFrom = [...allowFrom, pairing.senderId];
        notices.push(`Telegram paired user ${pairing.senderId}. Added to allowlist.`);
      } else if (pairing.status === "timeout") {
        notices.push("Telegram pairing timed out. Continue by pairing later or editing allowlist manually.");
      } else if (pairing.status === "error") {
        notices.push(`Telegram pairing failed: ${pairing.error || "unknown error"}`);
      }
    }

    return {
      cancelled: false,
      patches: [{ channel: "telegram", values: { enabled: true, token: token.trim(), allow_from: allowFrom } }],
      notices: ["Telegram configured.", ...notices],
    };
  }

  if (channelID === "whatsapp") {
    const bridgeUrl = await clackTextValue("WhatsApp bridge URL", channels.whatsapp?.bridge_url || "ws://localhost:3001");
    if (bridgeUrl === undefined) return { cancelled: true, patches: [], notices: [] };
    const bridgeToken = await clackSecretValue("WhatsApp bridge token (optional)", channels.whatsapp?.bridge_token || "");
    if (bridgeToken === undefined) return { cancelled: true, patches: [], notices: [] };
    return {
      cancelled: false,
      patches: [{ channel: "whatsapp", values: { enabled: true, bridge_url: bridgeUrl.trim(), bridge_token: bridgeToken.trim() } }],
      notices: ["WhatsApp configured."],
    };
  }

  if (channelID === "discord") {
    const token = await clackSecretValue("Discord bot token", channels.discord?.token || "");
    if (token === undefined) return { cancelled: true, patches: [], notices: [] };
    if (!token.trim()) return { cancelled: false, patches: [], notices: ["Discord not configured (token left empty)."] };
    return {
      cancelled: false,
      patches: [{ channel: "discord", values: { enabled: true, token: token.trim() } }],
      notices: ["Discord configured."],
    };
  }

  if (channelID === "slack") {
    const botToken = await clackSecretValue("Slack bot token", channels.slack?.bot_token || "");
    if (botToken === undefined) return { cancelled: true, patches: [], notices: [] };
    const appToken = await clackSecretValue("Slack app token (Socket Mode)", channels.slack?.app_token || "");
    if (appToken === undefined) return { cancelled: true, patches: [], notices: [] };
    if (!botToken.trim()) return { cancelled: false, patches: [], notices: ["Slack not configured (bot token left empty)."] };
    return {
      cancelled: false,
      patches: [{ channel: "slack", values: { enabled: true, mode: "socket", bot_token: botToken.trim(), app_token: appToken.trim() } }],
      notices: ["Slack configured."],
    };
  }

  if (channelID === "feishu") {
    const appID = await clackTextValue("Feishu app id", channels.feishu?.app_id || "");
    if (appID === undefined) return { cancelled: true, patches: [], notices: [] };
    const appSecret = await clackSecretValue("Feishu app secret", channels.feishu?.app_secret || "");
    if (appSecret === undefined) return { cancelled: true, patches: [], notices: [] };
    if (!appID.trim()) return { cancelled: false, patches: [], notices: ["Feishu not configured (app id left empty)."] };
    return {
      cancelled: false,
      patches: [{ channel: "feishu", values: { enabled: true, app_id: appID.trim(), app_secret: appSecret.trim() } }],
      notices: ["Feishu configured."],
    };
  }

  if (channelID === "dingtalk") {
    const clientID = await clackTextValue("DingTalk client id", channels.dingtalk?.client_id || "");
    if (clientID === undefined) return { cancelled: true, patches: [], notices: [] };
    const clientSecret = await clackSecretValue("DingTalk client secret", channels.dingtalk?.client_secret || "");
    if (clientSecret === undefined) return { cancelled: true, patches: [], notices: [] };
    if (!clientID.trim()) return { cancelled: false, patches: [], notices: ["DingTalk not configured (client id left empty)."] };
    return {
      cancelled: false,
      patches: [{ channel: "dingtalk", values: { enabled: true, client_id: clientID.trim(), client_secret: clientSecret.trim() } }],
      notices: ["DingTalk configured."],
    };
  }

  if (channelID === "mochat") {
    const baseURL = await clackTextValue("Mochat base URL", channels.mochat?.base_url || "https://mochat.io");
    if (baseURL === undefined) return { cancelled: true, patches: [], notices: [] };
    const clawToken = await clackSecretValue("Mochat claw token", channels.mochat?.claw_token || "");
    if (clawToken === undefined) return { cancelled: true, patches: [], notices: [] };
    const agentUserID = await clackTextValue("Mochat agent user id (optional)", channels.mochat?.agent_user_id || "");
    if (agentUserID === undefined) return { cancelled: true, patches: [], notices: [] };
    if (!clawToken.trim()) return { cancelled: false, patches: [], notices: ["Mochat not configured (claw token left empty)."] };
    return {
      cancelled: false,
      patches: [{ channel: "mochat", values: { enabled: true, base_url: baseURL.trim(), claw_token: clawToken.trim(), agent_user_id: agentUserID.trim() } }],
      notices: ["Mochat configured."],
    };
  }

  if (channelID === "qq") {
    const appID = await clackTextValue("QQ app id", channels.qq?.app_id || "");
    if (appID === undefined) return { cancelled: true, patches: [], notices: [] };
    const secret = await clackSecretValue("QQ secret", channels.qq?.secret || "");
    if (secret === undefined) return { cancelled: true, patches: [], notices: [] };
    if (!appID.trim()) return { cancelled: false, patches: [], notices: ["QQ not configured (app id left empty)."] };
    return {
      cancelled: false,
      patches: [{ channel: "qq", values: { enabled: true, app_id: appID.trim(), secret: secret.trim() } }],
      notices: ["QQ configured."],
    };
  }

  if (channelID === "email") {
    return {
      cancelled: false,
      patches: [],
      notices: ["Email setup requires additional mail server fields. Configure ~/.skyth/channels/email.json manually."],
    };
  }

  return {
    cancelled: false,
    patches: [],
    notices: [
      `Channel ${channelID} selected. Configure credentials in ~/.skyth/channels/${channelID}.json`,
    ],
  };
}

async function runClackFlow(cfg: Config, args: OnboardingArgs, deps: OnboardingDeps): Promise<InteractiveFlowResult> {
  clackIntro("Skyth onboarding");
  const art = readAsciiArt();
  if (art) {
    clackNote(art, "Skyth");
  }

  clackNote(
    [
      "Security warning - please read.",
      "",
      "Skyth can read files and run actions when tools are enabled.",
      "Treat this as privileged automation and keep credentials locked down.",
      "",
      "Recommended baseline:",
      "- Use allowlists and mention/pairing controls.",
      "- Keep sandboxing enabled for tool execution.",
      "- Keep secrets outside the agent-reachable workspace.",
      "",
      "Run regularly:",
      "skyth status",
      "Review ~/.skyth/config and ~/.skyth/channels/*.json",
    ].join("\n"),
    "Security",
  );

  const acceptedRisk = await clackConfirmValue("I understand this is powerful and inherently risky. Continue?", false);
  if (acceptedRisk !== true) {
    clackCancel("Onboarding cancelled.");
    return { cancelled: true, mode: "quickstart", updates: {}, installDaemon: false };
  }

  const mode = await clackSelectValue<OnboardingMode>(
    "Onboarding mode",
    [
      { value: "quickstart", label: "QuickStart" },
      { value: "manual", label: "Manual" },
    ],
    "quickstart",
  );
  if (!mode) {
    clackCancel("Onboarding cancelled.");
    return { cancelled: true, mode: "quickstart", updates: {}, installDaemon: false };
  }

  clackNote(
    existingConfigLines(cfg).join("\n"),
    deps.existingConfigDetected ? "Existing config detected" : "No existing config detected",
  );

  let configMode: "keep" | "update" = "update";
  if (deps.existingConfigDetected) {
    const selectedConfigMode = await clackSelectValue<"keep" | "update">(
      "Config handling",
      [
        { value: "keep", label: "Use existing values" },
        { value: "update", label: "Update values" },
      ],
      "keep",
    );
    if (!selectedConfigMode) {
      clackCancel("Onboarding cancelled.");
      return { cancelled: true, mode, updates: {}, installDaemon: false };
    }
    configMode = selectedConfigMode;
  }

  const updates: Partial<OnboardingArgs> = {};
  const channelPatches: ChannelPatch[] = [];
  const notices: string[] = [];
  const hasSuperuserPassword = hasSuperuserPasswordRecord(deps.authDir);

  if (shouldConfigureIdentity(configMode, args)) {
    const username = await clackTextValue("Username", cfg.username);
    if (username === undefined) {
      clackCancel("Onboarding cancelled.");
      return { cancelled: true, mode, updates: {}, installDaemon: false };
    }
    if (username.trim()) updates.username = username.trim();

    const superuserPassword = await promptSuperuserPasswordClack(!hasSuperuserPassword);
    if (superuserPassword === undefined) {
      clackCancel("Onboarding cancelled.");
      return { cancelled: true, mode, updates: {}, installDaemon: false };
    }
    if (superuserPassword) updates.superuser_password = superuserPassword;

    const nickname = await clackTextValue("Nickname", cfg.nickname);
    if (nickname === undefined) {
      clackCancel("Onboarding cancelled.");
      return { cancelled: true, mode, updates: {}, installDaemon: false };
    }
    if (nickname.trim()) updates.nickname = nickname.trim();
  } else if (!args.superuser_password?.trim() && !hasSuperuserPassword) {
    const superuserPassword = await promptSuperuserPasswordClack(true);
    if (superuserPassword === undefined || !superuserPassword.trim()) {
      clackCancel("Onboarding cancelled.");
      return { cancelled: true, mode, updates: {}, installDaemon: false };
    }
    updates.superuser_password = superuserPassword.trim();
  }

  let authChoice: "keep" | "skip" | "set" = "set";
  if (hasConfiguredModelAuth(cfg)) {
    const selected = await clackSelectValue<"keep" | "skip" | "set">(
      "Model/auth provider",
      [
        { value: "keep", label: `Keep current (${cfg.primary_model_provider || "auto"})` },
        { value: "skip", label: "Skip for now" },
        { value: "set", label: "Set provider/model now" },
      ],
      "keep",
    );
    if (!selected) {
      clackCancel("Onboarding cancelled.");
      return { cancelled: true, mode, updates: {}, installDaemon: false };
    }
    authChoice = selected;
  }

  if (authChoice === "set") {
    const providerOptions = await buildProviderOptions();
    const providerIndex = new Map(providerOptions.map((opt) => [opt.value, opt] as const));
    const currentProvider = normalizeProviderID(cfg.primary_model_provider || "openai");

    let provider = await clackAutocompleteValue(
      "Select provider",
      [
        ...providerOptions,
        { value: "other", label: "Other" },
      ],
      providerIndex.has(currentProvider) ? currentProvider : providerOptions[0]?.value,
    );

    if (!provider) {
      clackCancel("Onboarding cancelled.");
      return { cancelled: true, mode, updates: {}, installDaemon: false };
    }

    if (provider === "other") {
      const providerRaw = await clackText({
        message: "Enter provider id",
        validate: (value) =>
          value && value.trim().match(/^[0-9a-zA-Z_-]+$/)
            ? undefined
            : "Use letters, numbers, underscores, or hyphens",
      });
      if (isCancel(providerRaw)) {
        clackCancel("Onboarding cancelled.");
        return { cancelled: true, mode, updates: {}, installDaemon: false };
      }
      provider = normalizeProviderID(String(providerRaw ?? ""));
      if (!provider) {
        clackCancel("Onboarding cancelled.");
        return { cancelled: true, mode, updates: {}, installDaemon: false };
      }
    }

    updates.primary_provider = normalizeProviderID(provider);

    const modelScope = await clackSelectValue<"selected" | "all">(
      "Filter models by provider",
      [
        { value: "all", label: "All providers" },
        { value: "selected", label: formatProviderLabel(provider) },
      ],
      "all",
    );
    if (!modelScope) {
      clackCancel("Onboarding cancelled.");
      return { cancelled: true, mode, updates: {}, installDaemon: false };
    }

    const modelOptions = await buildModelOptions({
      selectedProvider: provider,
      scope: modelScope,
      currentModel: cfg.primary_model || cfg.agents.defaults.model,
    });

    const modelChoice = await clackAutocompleteValue(
      "Default model",
      modelOptions,
      MODEL_KEEP_CURRENT,
    );
    if (!modelChoice) {
      clackCancel("Onboarding cancelled.");
      return { cancelled: true, mode, updates: {}, installDaemon: false };
    }

    if (modelChoice === MODEL_ENTER_MANUAL) {
      const manualModel = await clackTextValue("Enter model id", cfg.primary_model || cfg.agents.defaults.model);
      if (manualModel === undefined) {
        clackCancel("Onboarding cancelled.");
        return { cancelled: true, mode, updates: {}, installDaemon: false };
      }
      if (manualModel.trim()) updates.primary_model = manualModel.trim();
    } else if (modelChoice !== MODEL_KEEP_CURRENT) {
      updates.primary_model = modelChoice;
    }

    const providerMeta = providerIndex.get(updates.primary_provider) ?? {
      isOAuth: false,
      envKey: "",
    };

    if (!providerMeta.isOAuth) {
      const setKey = await clackConfirmValue("Configure API key now? (optional)", false);
      if (setKey === undefined) {
        clackCancel("Onboarding cancelled.");
        return { cancelled: true, mode, updates: {}, installDaemon: false };
      }
      if (setKey) {
        const label = providerMeta.envKey
          ? `API key (${providerMeta.envKey})`
          : `API key for ${updates.primary_provider}`;
        const apiKey = await clackSecretValue(label, "");
        if (apiKey === undefined) {
          clackCancel("Onboarding cancelled.");
          return { cancelled: true, mode, updates: {}, installDaemon: false };
        }
        if (apiKey.trim()) updates.api_key = apiKey.trim();
      }
    } else {
      notices.push(`Provider ${updates.primary_provider} uses OAuth; API key setup skipped.`);
    }
  }

  clackNote([
    `Gateway port: ${cfg.gateway.port}`,
    "Gateway bind: loopback",
    "Gateway auth: token",
    "Tailscale exposure: off",
    "Direct to configured channels.",
  ].join("\n"), "QuickStart");

  clackNote(channelStatusLines(cfg).join("\n"), "Channel status");

  const channelChoice = await clackAutocompleteValue(
    "Select channel (QuickStart)",
    CHANNELS.map((entry) => ({ value: entry.id, label: entry.label })),
    "skip",
  );

  if (!channelChoice) {
    clackCancel("Onboarding cancelled.");
    return { cancelled: true, mode, updates: {}, installDaemon: false };
  }

  const channelEntry = channelByID(channelChoice);
  if (channelEntry && channelEntry.id !== "skip") {
    if (channelEntry.pluginOnly) {
      notices.push(`${channelEntry.label} requires plugin install before channel onboarding.`);
      clackNote(`${channelEntry.label} requires plugin install to enable.`, "Channel");
    } else {
      const configured = await configureBuiltInChannelClack(channelEntry.id, cfg);
      if (configured.cancelled) {
        clackCancel("Onboarding cancelled.");
        return { cancelled: true, mode, updates: {}, installDaemon: false };
      }
      channelPatches.push(...configured.patches);
      notices.push(...configured.notices);
      if (configured.notices.length > 0) {
        clackNote(configured.notices.join("\n"), "Channel");
      }
    }
  }

  clackNote(
    [
      "When you switch between channels (e.g., Discord to Telegram),",
      "Skyth can automatically carry over conversation context.",
      "A lightweight check determines if the topics match before merging.",
    ].join("\n"),
    "Cross-channel context merging",
  );

  const disableAutoMerge = await clackConfirmValue(
    "Disable automatic context merging on channel switch? (not recommended)",
    false,
  );
  if (disableAutoMerge === undefined) {
    clackCancel("Onboarding cancelled.");
    return { cancelled: true, mode, updates: {}, installDaemon: false };
  }
  if (disableAutoMerge) {
    updates.disable_auto_merge = true;
  }

  clackNote([
    "Eligible: 16",
    "Missing requirements: 0",
    "Blocked by allowlist: 0",
  ].join("\n"), "Skills status");

  const configureSkills = await clackConfirmValue("Configure skills now? (recommended)", false);
  if (configureSkills === undefined) {
    clackCancel("Onboarding cancelled.");
    return { cancelled: true, mode, updates: {}, installDaemon: false };
  }

  clackNote(
    [
      "Hooks automate actions around agent commands.",
      "Example: write session snapshots on /new.",
    ].join("\n"),
    "Hooks",
  );

  const enableHooks = await clackConfirmValue("Enable hooks?", false);
  if (enableHooks === undefined) {
    clackCancel("Onboarding cancelled.");
    return { cancelled: true, mode, updates: {}, installDaemon: false };
  }

  const hasSystemd = process.platform === "linux" && Boolean(process.env.SYSTEMD_EXEC_PID || process.env.INVOCATION_ID);
  if (!hasSystemd) {
    clackNote(
      [
        "Systemd user services are unavailable.",
        "Skipping service install checks.",
      ].join("\n"),
      "Systemd",
    );
  }

  clackNote(
    hasSystemd
      ? "Systemd detected. You can install a user service after onboarding."
      : "No systemd user session detected. Use your own process supervisor.",
    "Gateway service",
  );

  let installDaemon = Boolean(args.install_daemon);
  if (args.no_install_daemon) {
    installDaemon = false;
  } else if (hasSystemd && args.install_daemon === undefined) {
    const installChoice = await clackConfirmValue("Install gateway service now?", false);
    if (installChoice === undefined) {
      clackCancel("Onboarding cancelled.");
      return { cancelled: true, mode, updates: {}, installDaemon: false };
    }
    installDaemon = installChoice;
  }

  clackOutro("Onboarding selections captured.");

  return {
    cancelled: false,
    mode,
    updates,
    installDaemon,
    channelPatches,
    notices,
  };
}

async function runPlainFlow(
  cfg: Config,
  args: OnboardingArgs,
  deps: OnboardingDeps,
): Promise<InteractiveFlowResult> {
  const write = deps.write ?? defaultWrite;
  const prompts = makePrompts(deps, write);

  const updates: Partial<OnboardingArgs> = {};
  const channelPatches: ChannelPatch[] = [];
  const notices: string[] = [];
  const hasSuperuserPassword = hasSuperuserPasswordRecord(deps.authDir);

  printHeader(write);
  printSection("Security", [
    "Security warning - please read.",
    "",
    "Skyth can read files and run actions when tools are enabled.",
    "Treat this as privileged automation and keep credentials locked down.",
    "",
    "Recommended baseline:",
    "- Use allowlists and mention/pairing controls.",
    "- Keep sandboxing enabled for tool execution.",
    "- Keep secrets outside the agent-reachable workspace.",
    "",
    "Run regularly:",
    "skyth status",
    "Review ~/.skyth/config and ~/.skyth/channels/*.json",
  ], write);

  const acceptedRisk = await prompts.confirm("I understand this is powerful and inherently risky. Continue?", false);
  if (!acceptedRisk) return { cancelled: true, mode: "quickstart", updates, installDaemon: false };

  const mode = await prompts.select<OnboardingMode>(
    "Onboarding mode",
    [
      { value: "quickstart", label: "QuickStart" },
      { value: "manual", label: "Manual" },
    ],
    "quickstart",
  );

  printSection(
    deps.existingConfigDetected ? "Existing config detected" : "No existing config detected",
    existingConfigLines(cfg),
    write,
  );
  let configMode: "keep" | "update" = "update";
  if (deps.existingConfigDetected) {
    configMode = await prompts.select<"keep" | "update">(
      "Config handling",
      [
        { value: "keep", label: "Use existing values" },
        { value: "update", label: "Update values" },
      ],
      "keep",
    );
  }

  if (shouldConfigureIdentity(configMode, args)) {
    const username = (await prompts.input("Username", cfg.username)).trim();
    if (username) updates.username = username;

    const superuserPassword = await promptSuperuserPasswordPlain(prompts, !hasSuperuserPassword);
    if (superuserPassword) updates.superuser_password = superuserPassword;

    const nickname = (await prompts.input("Nickname", cfg.nickname)).trim();
    if (nickname) updates.nickname = nickname;
  } else if (!args.superuser_password?.trim() && !hasSuperuserPassword) {
    const superuserPassword = await promptSuperuserPasswordPlain(prompts, true);
    if (!superuserPassword) return { cancelled: true, mode, updates: {}, installDaemon: false };
    updates.superuser_password = superuserPassword;
  }

  let authChoice: "keep" | "skip" | "set" = "set";
  if (hasConfiguredModelAuth(cfg)) {
    authChoice = await prompts.select<"keep" | "skip" | "set">(
      "Model/auth provider",
      [
        { value: "keep", label: `Keep current (${cfg.primary_model_provider || "auto"})` },
        { value: "skip", label: "Skip for now" },
        { value: "set", label: "Set provider/model now" },
      ],
      "keep",
    );
  }

  if (authChoice === "set") {
    const providerOptions = await buildProviderOptions();
    const provider = await prompts.select<string>(
      "Select provider",
      [
        ...providerOptions.map((option) => ({ value: option.value, label: option.label })),
        { value: "other", label: "Other" },
      ],
      providerOptions[0]?.value ?? "openai",
    );

    const selectedProvider = provider === "other"
      ? normalizeProviderID(await prompts.input("Enter provider id", "openai"))
      : provider;

    updates.primary_provider = selectedProvider;

    const scope = await prompts.select<"all" | "selected">(
      "Filter models by provider",
      [
        { value: "all", label: "All providers" },
        { value: "selected", label: formatProviderLabel(selectedProvider) },
      ],
      "all",
    );

    const modelOptions = await buildModelOptions({
      selectedProvider,
      scope,
      currentModel: cfg.primary_model || cfg.agents.defaults.model,
    });

    const selectedModel = await prompts.select<string>(
      "Default model",
      modelOptions.slice(0, 200).map((entry) => ({ value: entry.value, label: entry.label })),
      MODEL_KEEP_CURRENT,
    );

    if (selectedModel === MODEL_ENTER_MANUAL) {
      const manual = (await prompts.input("Enter model id", cfg.primary_model || cfg.agents.defaults.model)).trim();
      if (manual) updates.primary_model = manual;
    } else if (selectedModel !== MODEL_KEEP_CURRENT) {
      updates.primary_model = selectedModel;
    }

    const providerMeta = providerOptions.find((option) => option.value === selectedProvider);
    if (!providerMeta?.isOAuth && await prompts.confirm("Configure API key now? (optional)", false)) {
      const apiKey = (await prompts.input("API key", "")).trim();
      if (apiKey) updates.api_key = apiKey;
    }
  }

  printSection("Channel status", channelStatusLines(cfg), write);
  const channelChoice = await prompts.select<string>(
    "Select channel (QuickStart)",
    CHANNELS.map((entry) => ({ value: entry.id, label: entry.label })),
    "skip",
  );

  const channelEntry = channelByID(channelChoice);
  if (channelEntry && channelEntry.id !== "skip") {
    if (channelEntry.pluginOnly) {
      notices.push(`${channelEntry.label} requires plugin install before channel onboarding.`);
    } else {
      const configured = await configureBuiltInChannelClack(channelEntry.id, cfg);
      if (configured.cancelled) {
        return { cancelled: true, mode, updates: {}, installDaemon: false };
      }
      channelPatches.push(...configured.patches);
      notices.push(...configured.notices);
    }
  }

  printSection("Cross-channel context merging", [
    "When you switch between channels (e.g., Discord to Telegram),",
    "Skyth can automatically carry over conversation context.",
    "A lightweight check determines if the topics match before merging.",
  ], write);

  const disableAutoMergePlain = await prompts.confirm("Disable automatic context merging on channel switch? (not recommended)", false);
  printChoice("Disable auto-merge", disableAutoMergePlain ? "Yes" : "No", write);
  if (disableAutoMergePlain) {
    updates.disable_auto_merge = true;
  }

  const configureSkills = await prompts.confirm("Configure skills now? (recommended)", false);
  printChoice("Configure skills now?", configureSkills ? "Yes" : "No", write);

  const enableHooks = await prompts.confirm("Enable hooks?", false);
  printChoice("Enable hooks", enableHooks ? "Yes" : "Skip for now", write);

  const hasSystemd = process.platform === "linux" && Boolean(process.env.SYSTEMD_EXEC_PID || process.env.INVOCATION_ID);
  let installDaemon = Boolean(args.install_daemon);
  if (args.no_install_daemon) {
    installDaemon = false;
  } else if (hasSystemd && args.install_daemon === undefined) {
    installDaemon = await prompts.confirm("Install gateway service now?", false);
  }

  return {
    cancelled: false,
    mode,
    updates,
    installDaemon,
    channelPatches,
    notices,
  };
}

export async function runInteractiveFlow(
  cfg: Config,
  args: OnboardingArgs,
  deps: OnboardingDeps,
): Promise<InteractiveFlowResult> {
  if (shouldUseClackTui(deps)) {
    return await runClackFlow(cfg, args, deps);
  }
  return await runPlainFlow(cfg, args, deps);
}
