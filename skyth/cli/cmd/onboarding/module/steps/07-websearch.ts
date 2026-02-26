import type { OnboardingStepManifest, StepContext, StepResult } from "@/cli/cmd/onboarding/module/steps/registry";

export const STEP_MANIFEST: OnboardingStepManifest = {
  id: "websearch",
  name: "Web Search",
  description: "Configure web search providers (Exa, Serper, SerpApi, Brave)",
  order: 70,
  group: "websearch",
  optional: true,
};

export async function runWebsearchStep(ctx: StepContext): Promise<StepResult> {
  const {
    clackConfirmValue,
    clackAutocompleteValue,
    clackSecretValue,
    clackCancel: cancel,
    clackNote: note,
  } = await import("../clack_helpers");

  note(
    [
      "Web search allows your agent to look up information online.",
      "Supported providers: Exa, Serper, SerpApi, Brave Search.",
      "Configure one or more providers for fallback support.",
    ].join("\n"),
    "Web search",
  );

  const configureWebSearch = await clackConfirmValue("Configure web search now?", false);
  if (configureWebSearch === undefined) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  if (!configureWebSearch) {
    return { cancelled: false, updates: {}, notices: [], patches: [] };
  }

  const webSearchProviders = [
    { value: "exa", label: "Exa - AI-powered search" },
    { value: "serper", label: "Serper - Google results" },
    { value: "serpapi", label: "SerpApi - Google search API" },
    { value: "brave", label: "Brave Search - Privacy-focused" },
  ];

  const selectedProvider = await clackAutocompleteValue("Select provider", webSearchProviders, "exa");
  if (!selectedProvider) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  const apiKey = await clackSecretValue(`API key for ${selectedProvider}`, "");
  if (apiKey === undefined) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  if (!apiKey.trim()) {
    return { cancelled: false, updates: {}, notices: ["Web search skipped (no API key provided)."], patches: [] };
  }

  return {
    cancelled: false,
    updates: {
      websearch_providers: {
        [selectedProvider]: { api_key: apiKey.trim() },
      },
    },
    notices: [`Web search provider '${selectedProvider}' configured.`],
    patches: [],
  };
}
