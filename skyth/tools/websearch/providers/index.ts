import type { Config } from "@/config/schema";
import type { WebSearchProvider, WebSearchOptions, WebSearchResult } from "./types";
import { ExaSearchProvider } from "./exa";
import { SerperSearchProvider } from "./serper";
import { SerpApiSearchProvider } from "./serpapi";
import { BraveSearchProvider } from "./brave";
import { pickConfiguredProviderIds } from "../provider_helpers";

export type { WebSearchProvider, WebSearchOptions, WebSearchResult };
export { ExaSearchProvider };
export { SerperSearchProvider };
export { SerpApiSearchProvider };
export { BraveSearchProvider };

export function createProvider(id: string): WebSearchProvider | undefined {
	switch (id) {
		case "exa":
			return new ExaSearchProvider();
		case "serper":
			return new SerperSearchProvider();
		case "serpapi":
			return new SerpApiSearchProvider();
		case "brave":
			return new BraveSearchProvider();
		default:
			return undefined;
	}
}

export function getConfiguredProviders(config: Config): WebSearchProvider[] {
	const providerIds = pickConfiguredProviderIds(config);
	return providerIds
		.map((id) => createProvider(id))
		.filter((p): p is WebSearchProvider => p !== undefined);
}