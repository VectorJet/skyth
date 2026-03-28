import type { WebSearchProvider, WebSearchOptions, WebSearchResult } from "./types";
import { loadConfig } from "@/config/loader";
import type { Config } from "@/config/schema";
import { abortAfterAny } from "@/utils/abort";
import { formatSerpApiResults } from "../provider_helpers";

type SerpApiItem = {
	title?: string;
	link?: string;
	snippet?: string;
};

type SerpApiResponse = {
	organic_results?: SerpApiItem[];
};

const API_CONFIG = {
	SERPAPI: {
		BASE_URL: "https://serpapi.com",
		SEARCH_ENDPOINT: "/search",
	},
} as const;

function getApiKey(config: Config, provider: string): string | undefined {
	return config.websearch.providers[provider]?.api_key;
}

function getApiBase(config: Config, provider: string): string | undefined {
	return config.websearch.providers[provider]?.api_base;
}

export class SerpApiSearchProvider implements WebSearchProvider {
	readonly id = "serpapi";
	readonly name = "SerpApi";

	async search(
		query: string,
		options: WebSearchOptions,
	): Promise<WebSearchResult> {
		const config = loadConfig();
		const apiKey = getApiKey(config, this.id);

		if (!apiKey) {
			throw new Error("SerpApi API key not configured");
		}

		const apiBase = getApiBase(config, this.id) || API_CONFIG.SERPAPI.BASE_URL;
		const { signal, clearTimeout } = abortAfterAny(options.timeout || 25000);

		try {
			const params = new URLSearchParams({
				q: query,
				api_key: apiKey,
				num: String(options.numResults || 10),
				engine: "google",
			});

			const response = await fetch(
				`${apiBase}${API_CONFIG.SERPAPI.SEARCH_ENDPOINT}?${params}`,
				{
					method: "GET",
					headers: {
						"Content-Type": "application/json",
					},
					signal,
				},
			);

			clearTimeout();

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`SerpApi search error (${response.status}): ${errorText}`,
				);
			}

			const data = (await response.json()) as SerpApiResponse;
			const results = data.organic_results ?? [];

			if (results.length === 0) {
				return {
					output: "No search results found.",
					provider: this.id,
				};
			}

			return {
				output: formatSerpApiResults(results, options.numResults || 10),
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