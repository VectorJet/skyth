import type { WebSearchProvider, WebSearchOptions, WebSearchResult } from "./types";
import { loadConfig } from "@/config/loader";
import type { Config } from "@/config/schema";
import { abortAfterAny } from "@/utils/abort";
import { formatBraveResults } from "../provider_helpers";

type BraveItem = {
	title?: string;
	url?: string;
	description?: string;
};

type BraveResponse = {
	web?: {
		results?: BraveItem[];
	};
};

const API_CONFIG = {
	BRAVE: {
		BASE_URL: "https://api.search.brave.com",
		SEARCH_ENDPOINT: "/res/v1/web/search",
		DEFAULT_NUM_RESULTS: 10,
	},
} as const;

function getApiKey(config: Config, provider: string): string | undefined {
	return config.websearch.providers[provider]?.api_key;
}

export class BraveSearchProvider implements WebSearchProvider {
	readonly id = "brave";
	readonly name = "Brave Search";

	async search(
		query: string,
		options: WebSearchOptions,
	): Promise<WebSearchResult> {
		const config = loadConfig();
		const apiKey = getApiKey(config, this.id);

		if (!apiKey) {
			throw new Error("Brave Search API key not configured");
		}

		const { signal, clearTimeout } = abortAfterAny(options.timeout || 25000);

		try {
			const params = new URLSearchParams({
				q: query,
				count: String(
					options.numResults || API_CONFIG.BRAVE.DEFAULT_NUM_RESULTS,
				),
			});

			const response = await fetch(
				`${API_CONFIG.BRAVE.BASE_URL}${API_CONFIG.BRAVE.SEARCH_ENDPOINT}?${params}`,
				{
					method: "GET",
					headers: {
						"X-API-Key": apiKey,
						Accept: "application/json",
					},
					signal,
				},
			);

			clearTimeout();

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Brave Search error (${response.status}): ${errorText}`,
				);
			}

			const data = (await response.json()) as BraveResponse;
			const results = data.web?.results ?? [];

			if (results.length === 0) {
				return {
					output: "No search results found.",
					provider: this.id,
				};
			}

			return {
				output: formatBraveResults(
					results,
					options.numResults || API_CONFIG.BRAVE.DEFAULT_NUM_RESULTS,
				),
				provider: this.id,
			};
		} catch (error) {
			clearTimeout();
			if (error instanceof Error && error.name === "AbortError") {
				throw new Error("Search request timed out");
			}
			throw error;
		}
	}
}