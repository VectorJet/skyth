import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ProviderSpec {
  name: string;
  keywords: string[];
  env_key: string;
  display_name?: string;
  model_prefix?: string;
  skip_prefixes?: string[];
  is_gateway?: boolean;
  detect_by_key_prefix?: string;
  detect_by_base_keyword?: string;
  default_api_base?: string;
  strip_model_prefix?: boolean;
  is_oauth?: boolean;
}

export interface ModelsDevModel {
  id: string;
  name?: string;
  provider?: { npm?: string; api?: string };
  options?: Record<string, any>;
  headers?: Record<string, string>;
}

export interface ModelsDevProvider {
  id: string;
  name: string;
  env?: string[];
  npm?: string;
  api?: string;
  models: Record<string, ModelsDevModel>;
}

export const STATIC_PROVIDERS: ProviderSpec[] = [
  { name: "openrouter", keywords: ["openrouter"], env_key: "OPENROUTER_API_KEY", model_prefix: "openrouter", is_gateway: true, detect_by_key_prefix: "sk-or-", detect_by_base_keyword: "openrouter", default_api_base: "https://openrouter.ai/api/v1" },
  { name: "openai_codex", keywords: ["openai-codex", "codex"], env_key: "", is_oauth: true },
  { name: "github_copilot", keywords: ["github_copilot", "copilot"], env_key: "", model_prefix: "github_copilot", skip_prefixes: ["github_copilot/"], is_oauth: true },
  { name: "anthropic", keywords: ["anthropic", "claude"], env_key: "ANTHROPIC_API_KEY" },
  { name: "openai", keywords: ["openai", "gpt"], env_key: "OPENAI_API_KEY" },
  { name: "deepseek", keywords: ["deepseek"], env_key: "DEEPSEEK_API_KEY", model_prefix: "deepseek", skip_prefixes: ["deepseek/"] },
];

const MODELS_CACHE_PATH = join(homedir(), ".skyth", "cache", "models.json");

let modelsDevCache: Record<string, ModelsDevProvider> | undefined;

function normalizeKeywords(...parts: string[]): string[] {
  const out = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    const lower = part.toLowerCase();
    out.add(lower);
    out.add(lower.replaceAll("-", "_"));
    for (const token of lower.split(/[\s/_-]+/g)) {
      if (token) out.add(token);
    }
  }
  return [...out];
}

function dynamicSpecFromProvider(provider: ModelsDevProvider): ProviderSpec {
  return {
    name: provider.id.replaceAll("-", "_"),
    keywords: normalizeKeywords(provider.id, provider.name),
    env_key: provider.env?.[0] ?? "",
  };
}

export async function loadModelsDevCatalog(options?: {
  forceRefresh?: boolean;
  disableFetch?: boolean;
  url?: string;
}): Promise<Record<string, ModelsDevProvider>> {
  if (modelsDevCache && !options?.forceRefresh) return modelsDevCache;

  if (existsSync(MODELS_CACHE_PATH) && !options?.forceRefresh) {
    try {
      const parsed = JSON.parse(readFileSync(MODELS_CACHE_PATH, "utf-8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        modelsDevCache = parsed as Record<string, ModelsDevProvider>;
        return modelsDevCache;
      }
    } catch {
      // fall through
    }
  }

  if (!options?.disableFetch) {
    try {
      const baseURL = options?.url ?? process.env.OPENCODE_MODELS_URL ?? "https://models.dev";
      const response = await fetch(`${baseURL}/api.json`, { signal: AbortSignal.timeout(10_000) });
      if (response.ok) {
        const json = (await response.json()) as Record<string, ModelsDevProvider>;
        mkdirSync(join(homedir(), ".skyth", "cache"), { recursive: true });
        writeFileSync(MODELS_CACHE_PATH, JSON.stringify(json, null, 2), "utf-8");
        modelsDevCache = json;
        return json;
      }
    } catch {
      // ignore network failures and use static fallback
    }
  }

  modelsDevCache = {};
  return modelsDevCache;
}

export async function listProviderSpecs(options?: {
  disabledProviders?: string[];
  enabledProviders?: string[];
  includeDynamic?: boolean;
  disableFetch?: boolean;
}): Promise<ProviderSpec[]> {
  const disabled = new Set((options?.disabledProviders ?? []).map((x) => x.replaceAll("-", "_")));
  const enabled = options?.enabledProviders ? new Set(options.enabledProviders.map((x) => x.replaceAll("-", "_"))) : undefined;

  const base = [...STATIC_PROVIDERS];
  if (options?.includeDynamic !== false) {
    const catalog = await loadModelsDevCatalog({ disableFetch: options?.disableFetch });
    for (const provider of Object.values(catalog)) {
      const name = provider.id.replaceAll("-", "_");
      if (!base.some((p) => p.name === name)) base.push(dynamicSpecFromProvider(provider));
    }
  }

  return base.filter((spec) => {
    if (disabled.has(spec.name)) return false;
    if (enabled && !enabled.has(spec.name)) return false;
    return true;
  });
}

export const PROVIDERS: ProviderSpec[] = STATIC_PROVIDERS;

export function findByName(name: string): ProviderSpec | undefined {
  return STATIC_PROVIDERS.find((p) => p.name === name);
}

export function findByModel(model: string): ProviderSpec | undefined {
  const modelLower = model.toLowerCase();
  const modelNormalized = modelLower.replaceAll("-", "_");
  const modelPrefix = modelLower.includes("/") ? modelLower.split("/", 1)[0] : "";
  const normalizedPrefix = modelPrefix.replaceAll("-", "_");

  for (const spec of STATIC_PROVIDERS) {
    if (modelPrefix && normalizedPrefix === spec.name) return spec;
  }
  return STATIC_PROVIDERS.find((spec) =>
    spec.keywords.some((kw) => modelLower.includes(kw) || modelNormalized.includes(kw.replaceAll("-", "_"))),
  );
}

export function findGateway(providerName?: string, apiKey?: string, apiBase?: string): ProviderSpec | undefined {
  if (providerName) {
    const byName = findByName(providerName);
    if (byName?.is_gateway) return byName;
  }
  if (apiKey) {
    const byKey = STATIC_PROVIDERS.find((p) => p.is_gateway && p.detect_by_key_prefix && apiKey.startsWith(p.detect_by_key_prefix));
    if (byKey) return byKey;
  }
  if (apiBase) {
    const lower = apiBase.toLowerCase();
    const byBase = STATIC_PROVIDERS.find((p) => p.is_gateway && p.detect_by_base_keyword && lower.includes(p.detect_by_base_keyword));
    if (byBase) return byBase;
  }
  return undefined;
}

export function parseModelRef(input: string): { providerID: string; modelID: string } {
  const firstSlash = input.indexOf("/");
  if (firstSlash === -1) {
    return { providerID: "openai", modelID: input };
  }
  const providerID = input.slice(0, firstSlash);
  const modelID = input.slice(firstSlash + 1);
  return {
    providerID: providerID.replaceAll("-", "_"),
    modelID,
  };
}

export function preferredSmallModelCandidates(providerID: string): string[] {
  let priority = [
    "claude-haiku-4-5",
    "claude-haiku-4.5",
    "3-5-haiku",
    "3.5-haiku",
    "gemini-3-flash",
    "gemini-2.5-flash",
    "gpt-5-nano",
  ];
  if (providerID.startsWith("opencode")) {
    priority = ["gpt-5-nano"];
  }
  if (providerID.startsWith("github_copilot")) {
    priority = ["gpt-5-mini", "claude-haiku-4.5", ...priority];
  }
  return priority;
}
