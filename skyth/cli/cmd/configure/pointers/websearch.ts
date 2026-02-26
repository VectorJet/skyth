import type { ConfigureTopicManifest, ConfigureHandler, ConfigureHandlerArgs } from "@/cli/cmd/configure/registry";
import type { ConfigureArgs, ConfigureDeps } from "@/cli/cmd/configure/index";
import { loadConfig, saveConfig } from "@/cli/cmd/configure/../../config/loader";
import { promptInput } from "@/cli/cmd/configure/../runtime_helpers";
import {
  select as clackSelect,
  isCancel,
  password as clackPassword,
} from "@clack/prompts";
import { registry } from "@/cli/cmd/configure/registry";

export const MANIFEST: ConfigureTopicManifest = {
  id: "web-search",
  aliases: ["websearch"],
  description: "Configure web search providers",
};

const WEB_SEARCH_PROVIDERS = [
  { id: "exa", name: "Exa", description: "AI-powered web search" },
  { id: "serper", name: "Serper", description: "Google search results" },
  { id: "serpapi", name: "SerpApi", description: "Google search API" },
  { id: "brave", name: "Brave Search", description: "Privacy-focused search" },
] as const;

async function handler({ args, deps, useClack }: ConfigureHandlerArgs): Promise<{ exitCode: number; output: string }> {
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

export const topic = { manifest: MANIFEST, handler };
registry.register(topic);
