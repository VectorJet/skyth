import type { OnboardingStepManifest, StepContext, StepResult } from "@/cli/cmd/onboarding/module/steps/registry";
import { listProviderSpecs, loadModelsDevCatalog } from "@/cli/cmd/onboarding/module/../../../../providers/registry";

const MODEL_KEEP_CURRENT = "__keep_current__";
const MODEL_ENTER_MANUAL = "__manual_model__";

const PROVIDER_LABEL_OVERRIDES: Record<string, string> = {
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  github_copilot: "GitHub Copilot",
  google: "Google",
  openai: "OpenAI",
  openai_codex: "OpenAI Codex",
  opencode: "OpenCode Zen",
  opencode_zen: "OpenCode Zen",
  opencode_go: "OpenCode Go",
  opencode_go_zen: "OpenCode Zen",
  openrouter: "OpenRouter",
  vercel: "Vercel AI Gateway",
  vercel_ai_gateway: "Vercel AI Gateway",
};

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

export const STEP_MANIFEST: OnboardingStepManifest = {
  id: "model-selection",
  name: "Model Selection",
  description: "Select LLM provider and model",
  order: 50,
  group: "model",
};

async function buildProviderOptions() {
  const specs = await listProviderSpecs({ includeDynamic: true });

  const dedup = new Map<string, { value: string; label: string; hint?: string; isOAuth: boolean }>();

  for (const spec of specs) {
    const id = normalizeProviderID(spec.name);
    if (!id) continue;

    if (id === "opencode_go") {
      dedup.set("opencode_go", { value: "opencode_go", label: "OpenCode Go", hint: undefined, isOAuth: false });
      continue;
    }

    if (!dedup.has(id)) {
      dedup.set(id, {
        value: id,
        label: formatProviderLabel(id),
        hint: spec.is_oauth ? "OAuth" : undefined,
        isOAuth: Boolean(spec.is_oauth),
      });
    }
  }

  let options = [...dedup.values()].sort((a, b) => {
    if (a.value === "opencode") return -1;
    if (b.value === "opencode") return 1;
    return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
  });

  const opencodeIndex = options.findIndex((o) => o.value === "opencode");
  if (opencodeIndex >= 0) {
    options[opencodeIndex]!.label = "OpenCode Zen (recommended)";
    options[opencodeIndex]!.hint = "recommended";
  }

  return options;
}

function buildModelRef(providerID: string, modelID: string): string {
  const normalizedProvider = normalizeProviderID(providerID);
  const trimmedModel = modelID.trim();
  if (!trimmedModel) return "";
  const normalizedModel = trimmedModel.replaceAll("-", "_");
  if (normalizedModel.startsWith(`${normalizedProvider}/`)) {
    return `${normalizedProvider}/${trimmedModel.split("/").slice(1).join("/")}`;
  }
  return `${normalizedProvider}/${trimmedModel}`;
}

async function buildModelOptions(selectedProvider: string, currentModel: string) {
  const options = [
    { value: MODEL_KEEP_CURRENT, label: `Keep current (${currentModel})` },
  ];

  const catalog = await loadModelsDevCatalog();

  const normalizedSelected = selectedProvider.replaceAll("-", "_");
  const targetProviders: string[] = normalizedSelected === "opencode" || normalizedSelected === "opencode_go"
    ? ["opencode", "opencode_go", "opencode-go"]
    : [normalizedSelected];

  for (const provider of Object.values(catalog)) {
    const normalizedProvider = provider.id.replaceAll("-", "_");
    if (!targetProviders.includes(normalizedProvider)) continue;

    const providerLabel = provider.name?.trim() || formatProviderLabel(provider.id);
    for (const [modelID, modelDef] of Object.entries(provider.models ?? {})) {
      const ref = buildModelRef(provider.id, modelID);
      if (!ref) continue;
      const name = modelDef?.name?.trim() || modelID;
      options.push({
        value: ref,
        label: `${providerLabel} / ${name}`,
      });
    }
  }

  options.push({ value: MODEL_ENTER_MANUAL, label: "Enter model manually" });
  return options;
}

export async function runModelSelectionStep(ctx: StepContext): Promise<StepResult> {
  const {
    clackSelectValue,
    clackAutocompleteValue,
    clackTextValue,
    clackSecretValue,
    clackCancel: cancel,
    clackNote: note,
  } = await import("../clack_helpers");

  const hasConfiguredAuth = Boolean(
    ctx.cfg.primary_model_provider && (ctx.cfg as any).providers?.[ctx.cfg.primary_model_provider]?.api_key,
  );

  let authChoice: "keep" | "skip" | "set" = "set";
  if (hasConfiguredAuth) {
    const selected = await clackSelectValue<"keep" | "skip" | "set">(
      "Model/auth provider",
      [
        { value: "keep", label: `Keep current (${ctx.cfg.primary_model_provider || "auto"})` },
        { value: "skip", label: "Skip for now" },
        { value: "set", label: "Set provider/model now" },
      ],
      "keep",
    );
    if (!selected) {
      cancel("Onboarding cancelled.");
      return { cancelled: true, updates: {}, notices: [], patches: [] };
    }
    authChoice = selected;
  }

  if (authChoice === "skip" || authChoice === "keep") {
    return { cancelled: false, updates: {}, notices: [], patches: [] };
  }

  const providerOptions = await buildProviderOptions();
  const currentProvider = normalizeProviderID(ctx.cfg.primary_model_provider || "openai");

  let provider = await clackAutocompleteValue(
    "Select provider",
    [...providerOptions, { value: "other", label: "Other" }],
    providerOptions[0]?.value || currentProvider,
  );

  if (!provider) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  if (provider === "other") {
    const providerRaw = await clackTextValue("Enter provider id", "openai");
    if (!providerRaw) {
      cancel("Onboarding cancelled.");
      return { cancelled: true, updates: {}, notices: [], patches: [] };
    }
    provider = normalizeProviderID(providerRaw);
  }

  const updates: Record<string, any> = { primary_provider: provider };

  const modelOptions = await buildModelOptions(provider, ctx.cfg.primary_model || ctx.cfg.agents?.defaults?.model || "");

  const modelChoice = await clackAutocompleteValue(
    "Default model",
    modelOptions,
    MODEL_KEEP_CURRENT,
  );

  if (!modelChoice) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  if (modelChoice === MODEL_ENTER_MANUAL) {
    const manualModel = await clackTextValue("Enter model id", ctx.cfg.primary_model || "");
    if (manualModel?.trim()) {
      updates.primary_model = manualModel.trim();
    }
  } else if (modelChoice !== MODEL_KEEP_CURRENT) {
    updates.primary_model = modelChoice;
  }

  const selectedProviderMeta = providerOptions.find((p) => p.value === provider);
  if (selectedProviderMeta && !selectedProviderMeta.isOAuth) {
    const setKey = await clackSelectValue<"yes" | "no">(
      "Configure API key now?",
      [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No, skip" },
      ],
      "no",
    );

    if (setKey === "yes") {
      const apiKey = await clackSecretValue(`API key for ${provider}`, "");
      if (apiKey?.trim()) {
        updates.api_key = apiKey.trim();
      }
    }
  }

  return { cancelled: false, updates, notices: [], patches: [] };
}
