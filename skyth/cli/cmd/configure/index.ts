import { writeSuperuserPasswordRecord } from "../../../auth/superuser";
import { loadConfig, saveConfig } from "../../../config/loader";
import type { Config } from "../../../config/schema";
import { listProviderSpecs, parseModelRef } from "../../../providers/registry";
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

async function configureUsername(
  args: ConfigureArgs,
  deps: Required<Pick<ConfigureDeps, "loadConfigFn" | "saveConfigFn" | "promptInputFn">>,
): Promise<{ exitCode: number; output: string }> {
  const cfg = deps.loadConfigFn();
  const raw = (args.value ?? "").trim() || (await deps.promptInputFn("Username: "));
  const username = raw.trim();
  if (!username) return { exitCode: 1, output: "Error: username cannot be empty." };
  cfg.username = username;
  deps.saveConfigFn(cfg);
  return { exitCode: 0, output: `Updated username: ${username}` };
}

async function configurePassword(
  args: ConfigureArgs,
  deps: Required<Pick<ConfigureDeps, "promptInputFn" | "writeSuperuserPasswordRecordFn">>,
): Promise<{ exitCode: number; output: string }> {
  const value = (args.value ?? "").trim() || (await deps.promptInputFn("Superuser password: "));
  if (!value.trim()) return { exitCode: 1, output: "Error: password cannot be empty." };
  const written = await deps.writeSuperuserPasswordRecordFn(value.trim());
  return { exitCode: 0, output: `Superuser password updated.\nRecord: ${written.path}` };
}

async function resolveProviderID(
  args: ConfigureArgs,
  deps: Required<Pick<ConfigureDeps, "chooseProviderFn" | "listProviderSpecsFn">>,
): Promise<string | undefined> {
  const specs = await deps.listProviderSpecsFn({ includeDynamic: true });
  const providerIDs = specs.map((s) => s.name).sort();
  const fromArg = normalizeProviderID(args.provider ?? args.value ?? "");
  if (fromArg && providerIDs.includes(fromArg)) return fromArg;
  if (fromArg && !providerIDs.includes(fromArg)) return undefined;
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
): Promise<{ exitCode: number; output: string }> {
  const providerID = await resolveProviderID(args, deps);
  if (!providerID) return { exitCode: 1, output: "Error: provider is required." };

  const cfg = deps.loadConfigFn();
  const providers = cfg.providers as Record<string, { api_key?: string; api_base?: string }>;
  const provider = providers[providerID] ?? { api_key: "" };
  providers[providerID] = provider;

  const apiKey = (args.api_key ?? "").trim() || (await deps.promptInputFn(`API key for ${providerID} (leave blank to keep current): `));
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
): Promise<{ exitCode: number; output: string }> {
  const cfg = deps.loadConfigFn();
  const rawModel = (args.model ?? args.value ?? "").trim() || (await deps.promptInputFn("Primary model (provider/model): "));
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

  const injected = {
    loadConfigFn: deps?.loadConfigFn ?? loadConfig,
    saveConfigFn: deps?.saveConfigFn ?? ((cfg: Config) => saveConfig(cfg)),
    promptInputFn: deps?.promptInputFn ?? promptInput,
    chooseProviderFn: deps?.chooseProviderFn ?? chooseProviderInteractive,
    listProviderSpecsFn: deps?.listProviderSpecsFn ?? listProviderSpecs,
    writeSuperuserPasswordRecordFn: deps?.writeSuperuserPasswordRecordFn ?? writeSuperuserPasswordRecord,
  };

  if (topic === "username") return await configureUsername(args, injected);
  if (topic === "password") return await configurePassword(args, injected);
  if (topic === "provider" || topic === "providers") return await configureProvider(args, injected);
  if (topic === "model" || topic === "models") return await configureModel(args, injected);
  return { exitCode: 1, output: `Error: unknown configure topic '${topic}'.\n\n${usage()}` };
}
