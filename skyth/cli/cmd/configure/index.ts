import {
  autocomplete as clackAutocomplete,
  cancel as clackCancel,
  intro as clackIntro,
  isCancel,
  outro as clackOutro,
  password as clackPassword,
  text as clackText,
} from "@clack/prompts";
import { writeSuperuserPasswordRecord } from "../../../auth/superuser";
import { loadConfig, saveConfig } from "../../../config/loader";
import type { Config } from "../../../config/schema";
import { listProviderSpecs, loadModelsDevCatalog, parseModelRef } from "../../../providers/registry";
import { chooseProviderInteractive, promptInput } from "../../runtime_helpers";

export interface ConfigureArgs {
  topic?: string;
  value?: string;
  provider?: string;
  api_key?: string;
  api_base?: string;
  model?: string;
  primary?: boolean;
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
    "",
    "Examples:",
    "  skyth configure username tammy",
    "  skyth configure password --value my-secret",
    "  skyth configure provider openai --api-key sk-...",
    "  skyth configure provider --provider groq --api-key gsk-...",
    "  skyth configure model groq/moonshotai/kimi-k2-instruct-0905",
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
    return { exitCode: 1, output: `Error: unknown configure topic '${topic}'.\n\n${usage()}` };
  } finally {
    // no-op; clack handles cleanup itself
  }
}
