import type { Config } from "@/config/schema";

type SerperItem = { title?: string; url?: string; snippet?: string };
type SerpApiItem = { title?: string; link?: string; snippet?: string };
type BraveItem = { title?: string; url?: string; description?: string };

export function formatSerperResults(results: SerperItem[], limit: number): string {
  if (results.length === 0) return "No search results found.";
  return results
    .slice(0, limit)
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet || ""}`)
    .join("\n\n");
}

export function formatSerpApiResults(results: SerpApiItem[], limit: number): string {
  if (results.length === 0) return "No search results found.";
  return results
    .slice(0, limit)
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet || ""}`)
    .join("\n\n");
}

export function formatBraveResults(results: BraveItem[], limit: number): string {
  if (results.length === 0) return "No search results found.";
  return results
    .slice(0, limit)
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description || ""}`)
    .join("\n\n");
}

export function pickConfiguredProviderIds(config: Config): string[] {
  return Object.keys(config.websearch.providers).filter(
    (id) => config.websearch.providers[id]?.api_key,
  );
}
