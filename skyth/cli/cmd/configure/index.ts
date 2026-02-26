import {
  autocomplete as clackAutocomplete,
  cancel as clackCancel,
  confirm as clackConfirm,
  intro as clackIntro,
  isCancel,
  outro as clackOutro,
  password as clackPassword,
  select as clackSelect,
  text as clackText,
} from "@clack/prompts";
import { writeSuperuserPasswordRecord } from "../../../auth/superuser";
import { loadConfig, saveConfig } from "../../../config/loader";
import type { Config } from "../../../config/schema";
import { listProviderSpecs, loadModelsDevCatalog, parseModelRef } from "../../../providers/registry";
import { channelsEditCommand, requireSuperuserForConfiguredChannel } from "../channels";
import { isKnownChannel, knownChannelsText } from "../channels/utils";
import { CHANNEL_SECRET_PATHS } from "../../../auth/secret_store";
import { chooseProviderInteractive, promptInput } from "../../runtime_helpers";

export interface ConfigureArgs {
  topic?: string;
  value?: string;
  provider?: string;
  api_key?: string;
  api_base?: string;
  model?: string;
  primary?: boolean;
  channel?: string;
  enable?: boolean;
  disable?: boolean;
  set?: string;
  json?: string;
}

export interface ConfigureDeps {
  loadConfigFn?: () => Config;
  saveConfigFn?: (cfg: Config) => void;
  promptInputFn?: (prompt: string) => Promise<string>;
  promptPasswordFn?: (prompt: string) => Promise<string>;
  chooseProviderFn?: (providerIDs: string[]) => Promise<string | undefined>;
  listProviderSpecsFn?: typeof listProviderSpecs;
  writeSuperuserPasswordRecordFn?: typeof writeSuperuserPasswordRecord;
}

function usage(): string {
  return [
    "Usage: skyth configure TOPIC [VALUE] [options]",
    "",
    "Topics:",
    "  username      Set account username",
    "  password      Set superuser password",
    "  provider      Configure provider credentials",
    "  providers     Alias for provider",
    "  model         Set primary model",
    "  models        Alias for model",
    "  channels      Configure a channel (requires superuser if previously configured)",
    "  channel       Alias for channels",
    "  web-search    Configure web search providers",
    "",
    "Examples:",
    "  skyth configure username tammy",
    "  skyth configure password --value my-secret",
    "  skyth configure provider openai --api-key sk-...",
    "  skyth configure provider --provider groq --api-key gsk-...",
    "  skyth configure model groq/moonshotai/kimi-k2-instruct-0905",
    "  skyth configure channels telegram --json '{\"token\":\"bot123\"}'",
    "  skyth configure channels telegram --enable",
    "  skyth configure web-search exa --api-key sk-...",
    "  skyth configure web-search brave --api-key BRAVE_API_KEY",
  ].join("\n");
}

function normalizeProviderID(value: string): string {
  return value.trim().replaceAll("-", "_");
}

const MODEL_ENTER_MANUAL = "__manual_model__";

function shouldUseClack(deps?: ConfigureDeps): boolean {
  if (deps?.promptInputFn || deps?.promptPasswordFn || deps?.chooseProviderFn) return false;
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function promptTextValue(
  message: string,
  deps: Required<Pick<ConfigureDeps, "promptInputFn">>,
  useClack: boolean,
  secret = false,
): Promise<string | undefined> {
  if (!useClack) {
    return (await deps.promptInputFn(message)).trim();
  }
  const value = secret
    ? await clackPassword({ message, mask: "*" })
    : await clackText({ message });
  if (isCancel(value)) return undefined;
  return String(value ?? "").trim();
}

function currentProviderID(cfg: Config): string {
  const explicit = normalizeProviderID(cfg.primary_model_provider || "");
  if (explicit) return explicit;
  const model = (cfg.primary_model || cfg.agents.defaults.model || "").trim();
  if (!model.includes("/")) return "";
  return normalizeProviderID(model.split("/", 1)[0] || "");
}

async function selectModelWithClack(cfg: Config): Promise<string | undefined> {
  const catalog = await loadModelsDevCatalog();
  const providers = Object.values(catalog)
    .map((provider) => ({
      id: normalizeProviderID(provider.id),
      label: provider.name?.trim() || provider.id,
      models: provider.models ?? {},
    }))
    .filter((provider) => provider.id);

  if (!providers.length) return undefined;

  const initialProvider = currentProviderID(cfg) || providers[0]!.id;
  const providerChoice = await clackAutocomplete<string>({
    message: "Model provider",
    options: providers.map((provider) => ({
      value: provider.id,
      label: provider.label,
    })),
    initialValue: initialProvider,
  });
  if (isCancel(providerChoice)) return undefined;
  const providerID = normalizeProviderID(String(providerChoice ?? ""));
  if (!providerID) return undefined;

  const provider = providers.find((p) => p.id === providerID);
  const modelOptions = Object.entries(provider?.models ?? {})
    .map(([modelID, modelDef]) => ({
      value: `${providerID}/${modelID}`,
      label: modelDef?.name?.trim()
        ? `${modelDef.name} (${modelID})`
        : modelID,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));

  if (!modelOptions.length) {
    const manual = await clackText({ message: "Primary model (provider/model)" });
    if (isCancel(manual)) return undefined;
    return String(manual ?? "").trim();
  }

  const modelChoice = await clackAutocomplete<string>({
    message: "Primary model",
    options: [
      ...modelOptions.slice(0, 2500),
      { value: MODEL_ENTER_MANUAL, label: "Enter model manually" },
    ],
    initialValue: modelOptions[0]!.value,
  });
  if (isCancel(modelChoice)) return undefined;
  if (String(modelChoice) === MODEL_ENTER_MANUAL) {
    const manual = await clackText({ message: "Primary model (provider/model)" });
    if (isCancel(manual)) return undefined;
    return String(manual ?? "").trim();
  }
  return String(modelChoice ?? "").trim();
}

async function configureUsername(
  args: ConfigureArgs,
  deps: Required<Pick<ConfigureDeps, "loadConfigFn" | "saveConfigFn" | "promptInputFn">>,
  useClack: boolean,
): Promise<{ exitCode: number; output: string }> {
  const cfg = deps.loadConfigFn();
  const raw = (args.value ?? "").trim() || (await promptTextValue("Username", deps, useClack));
  if (raw === undefined) return { exitCode: 1, output: "Cancelled." };
  const username = raw.trim();
  if (!username) return { exitCode: 1, output: "Error: username cannot be empty." };
  cfg.username = username;
  deps.saveConfigFn(cfg);
  return { exitCode: 0, output: `Updated username: ${username}` };
}

async function configurePassword(
  args: ConfigureArgs,
  deps: Required<Pick<ConfigureDeps, "promptInputFn" | "writeSuperuserPasswordRecordFn">>,
  useClack: boolean,
): Promise<{ exitCode: number; output: string }> {
  const value = (args.value ?? "").trim() || (await promptTextValue("Superuser password", deps, useClack, true));
  if (value === undefined) return { exitCode: 1, output: "Cancelled." };
  if (!value.trim()) return { exitCode: 1, output: "Error: password cannot be empty." };
  const written = await deps.writeSuperuserPasswordRecordFn(value.trim());
  return { exitCode: 0, output: `Superuser password updated.\nRecord: ${written.path}` };
}

async function resolveProviderID(
  args: ConfigureArgs,
  deps: Required<Pick<ConfigureDeps, "chooseProviderFn" | "listProviderSpecsFn">>,
  useClack: boolean,
): Promise<string | undefined> {
  const specs = await deps.listProviderSpecsFn({ includeDynamic: true });
  const providerIDs = specs.map((s) => s.name).sort();
  const fromArg = normalizeProviderID(args.provider ?? args.value ?? "");
  if (fromArg && providerIDs.includes(fromArg)) return fromArg;
  if (fromArg && !providerIDs.includes(fromArg)) return undefined;
  if (useClack) {
    const value = await clackAutocomplete<string>({
      message: "Provider",
      options: providerIDs.map((id) => ({ value: id, label: id })),
      initialValue: providerIDs[0] || "openai",
    });
    if (isCancel(value)) return undefined;
    return normalizeProviderID(String(value ?? ""));
  }
  return await deps.chooseProviderFn(providerIDs);
}

async function configureProvider(
  args: ConfigureArgs,
  deps: Required<
    Pick<
      ConfigureDeps,
      "loadConfigFn" | "saveConfigFn" | "promptInputFn" | "chooseProviderFn" | "listProviderSpecsFn"
    >
  >,
  useClack: boolean,
): Promise<{ exitCode: number; output: string }> {
  const providerID = await resolveProviderID(args, deps, useClack);
  if (!providerID) return { exitCode: 1, output: "Error: provider is required." };

  const cfg = deps.loadConfigFn();
  const providers = cfg.providers as Record<string, { api_key?: string; api_base?: string }>;
  const provider = providers[providerID] ?? { api_key: "" };
  providers[providerID] = provider;

  const apiKey = (args.api_key ?? "").trim()
    || (await promptTextValue(`API key for ${providerID} (leave blank to keep current)`, deps, useClack, true))
    || "";
  const apiBase = (args.api_base ?? "").trim();
  if (apiKey) provider.api_key = apiKey;
  if (apiBase) provider.api_base = apiBase;
  if (args.primary) cfg.primary_model_provider = providerID;

  deps.saveConfigFn(cfg);

  const lines = [`Configured provider: ${providerID}`];
  lines.push(apiKey ? "API key updated." : "API key unchanged.");
  if (apiBase) lines.push(`API base set: ${apiBase}`);
  if (args.primary) lines.push("Marked as primary provider.");
  return { exitCode: 0, output: lines.join("\n") };
}

async function configureModel(
  args: ConfigureArgs,
  deps: Required<Pick<ConfigureDeps, "loadConfigFn" | "saveConfigFn" | "promptInputFn">>,
  useClack: boolean,
): Promise<{ exitCode: number; output: string }> {
  const cfg = deps.loadConfigFn();
  let rawModel = (args.model ?? args.value ?? "").trim();
  if (!rawModel && useClack) {
    rawModel = (await selectModelWithClack(cfg)) ?? "";
  }
  if (!rawModel) {
    rawModel = (await promptTextValue("Primary model (provider/model)", deps, useClack)) ?? "";
  }
  const model = rawModel.trim();
  if (!model) return { exitCode: 1, output: "Error: model cannot be empty." };
  if (!model.includes("/")) {
    return { exitCode: 1, output: "Error: model must be in provider/model format." };
  }

  const parsed = parseModelRef(model);
  cfg.primary_model = model;
  cfg.agents.defaults.model = model;
  if (parsed.providerID) cfg.primary_model_provider = parsed.providerID;
  deps.saveConfigFn(cfg);
  return {
    exitCode: 0,
    output: [
      `Updated primary model: ${model}`,
      parsed.providerID ? `Primary provider: ${parsed.providerID}` : "Primary provider unchanged.",
    ].join("\n"),
  };
}

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

async function configureChannels(
  args: ConfigureArgs,
  deps: Required<Pick<ConfigureDeps, "promptInputFn">>,
  useClack: boolean,
): Promise<{ exitCode: number; output: string }> {
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

const WEB_SEARCH_PROVIDERS = [
  { id: "exa", name: "Exa", description: "AI-powered web search" },
  { id: "serper", name: "Serper", description: "Google search results" },
  { id: "serpapi", name: "SerpApi", description: "Google search API" },
  { id: "brave", name: "Brave Search", description: "Privacy-focused search" },
] as const;

async function configureWebSearch(
  args: ConfigureArgs,
  deps: Required<Pick<ConfigureDeps, "loadConfigFn" | "saveConfigFn" | "promptInputFn">>,
  useClack: boolean,
): Promise<{ exitCode: number; output: string }> {
  const cfg = deps.loadConfigFn();

  let providerID = (args.provider ?? args.value ?? "").trim().toLowerCase();

  if (!providerID && useClack) {
    const choice = await clackSelect<string>({
      message: "Select web search provider",
      options: WEB_SEARCH_PROVIDERS.map((p) => ({
        value: p.id,
        label: `${p.name} - ${p.description}`,
      })),
    });
    if (isCancel(choice)) return { exitCode: 1, output: "Cancelled." };
    providerID = String(choice ?? "").trim();
  }

  if (!providerID && !useClack) {
    providerID = (await deps.promptInputFn(`Web search provider (${WEB_SEARCH_PROVIDERS.map((p) => p.id).join(", ")}): `)).trim().toLowerCase();
  }

  if (!providerID) return { exitCode: 1, output: "Error: provider is required." };

  const validProvider = WEB_SEARCH_PROVIDERS.find((p) => p.id === providerID);
  if (!validProvider) {
    return { exitCode: 1, output: `Error: unknown provider '${providerID}'. Available: ${WEB_SEARCH_PROVIDERS.map((p) => p.id).join(", ")}` };
  }

  const providers = cfg.websearch.providers;
  const provider = providers[providerID] ?? { api_key: "" };
  providers[providerID] = provider;

  const apiKey = (args.api_key ?? "").trim();
  if (!apiKey && useClack) {
    const raw = await clackPassword({
      message: `API key for ${validProvider.name}`,
      mask: "*",
    });
    if (isCancel(raw)) return { exitCode: 1, output: "Cancelled." };
    if (raw) provider.api_key = String(raw).trim();
  } else if (!apiKey && !useClack) {
    const input = await deps.promptInputFn(`API key for ${validProvider.name}: `);
    if (input) provider.api_key = input.trim();
  } else {
    provider.api_key = apiKey;
  }

  if (args.api_base) {
    provider.api_base = args.api_base.trim();
  }

  deps.saveConfigFn(cfg);

  const lines = [`Configured web search provider: ${validProvider.name}`];
  lines.push(provider.api_key ? "API key saved." : "No API key provided.");
  if (provider.api_base) lines.push(`API base set: ${provider.api_base}`);

  return { exitCode: 0, output: lines.join("\n") };
}

export async function configureCommand(
  args: ConfigureArgs,
  deps?: ConfigureDeps,
): Promise<{ exitCode: number; output: string }> {
  const topic = String(args.topic ?? "").trim().toLowerCase();
  if (!topic || topic === "help") return { exitCode: 0, output: usage() };
  const useClack = shouldUseClack(deps);

  const injected = {
    loadConfigFn: deps?.loadConfigFn ?? loadConfig,
    saveConfigFn: deps?.saveConfigFn ?? ((cfg: Config) => saveConfig(cfg)),
    promptInputFn: deps?.promptInputFn ?? promptInput,
    chooseProviderFn: deps?.chooseProviderFn ?? chooseProviderInteractive,
    listProviderSpecsFn: deps?.listProviderSpecsFn ?? listProviderSpecs,
    writeSuperuserPasswordRecordFn: deps?.writeSuperuserPasswordRecordFn ?? writeSuperuserPasswordRecord,
  };

  if (useClack) clackIntro("Skyth configure");
  try {
    if (topic === "username") {
      const result = await configureUsername(args, injected, useClack);
      if (useClack && result.exitCode === 0) clackOutro(result.output);
      if (useClack && result.exitCode !== 0 && result.output === "Cancelled.") clackCancel("Configuration cancelled.");
      return result;
    }
    if (topic === "password") {
      const result = await configurePassword(args, injected, useClack);
      if (useClack && result.exitCode === 0) clackOutro("Superuser password updated.");
      if (useClack && result.exitCode !== 0 && result.output === "Cancelled.") clackCancel("Configuration cancelled.");
      return result;
    }
    if (topic === "provider" || topic === "providers") {
      const result = await configureProvider(args, injected, useClack);
      if (useClack && result.exitCode === 0) clackOutro(result.output.split("\n")[0] ?? "Provider configured.");
      if (useClack && result.exitCode !== 0 && result.output === "Error: provider is required.") {
        clackCancel("Configuration cancelled.");
      }
      return result;
    }
    if (topic === "model" || topic === "models") {
      const result = await configureModel(args, injected, useClack);
      if (useClack && result.exitCode === 0) clackOutro(result.output.split("\n")[0] ?? "Model configured.");
      if (useClack && result.exitCode !== 0 && result.output === "Cancelled.") clackCancel("Configuration cancelled.");
      return result;
    }
    if (topic === "channels" || topic === "channel") {
      const result = await configureChannels(args, injected, useClack);
      if (useClack && result.exitCode === 0) clackOutro(result.output.split("\n")[0] ?? "Channel configured.");
      if (useClack && result.exitCode !== 0 && result.output === "Cancelled.") clackCancel("Configuration cancelled.");
      return result;
    }
    if (topic === "web-search" || topic === "websearch") {
      const result = await configureWebSearch(args, injected, useClack);
      if (useClack && result.exitCode === 0) clackOutro(result.output.split("\n")[0] ?? "Web search configured.");
      if (useClack && result.exitCode !== 0 && result.output === "Cancelled.") clackCancel("Configuration cancelled.");
      return result;
    }
    return { exitCode: 1, output: `Error: unknown configure topic '${topic}'.\n\n${usage()}` };
  } finally {
    // no-op; clack handles cleanup itself
  }
}
