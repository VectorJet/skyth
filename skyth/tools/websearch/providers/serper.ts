import type { WebSearchProvider, WebSearchOptions, WebSearchResult } from "./types";
import { loadConfig } from "@/config/loader";
import type { Config } from "@/config/schema";
import { abortAfterAny } from "@/utils/abort";
import { formatSerperResults } from "../provider_helpers";

type SerperItem = {
	title?: string;
	url?: string;
	snippet?: string;
};

type SerperResponse = {
	organic?: SerperItem[];
};

const API_CONFIG = {
	SERPER: {
		BASE_URL: "https://google.serper.dev",
		SEARCH_ENDPOINT: "/search",
	},
} as const;

function getApiKey(config: Config, provider: string): string | undefined {
	return config.websearch.providers[provider]?.api_key;
}

export class SerperSearchProvider implements WebSearchProvider {
	readonly id = "serper";
	readonly name = "Serper";

	async search(
		query: string,
		options: WebSearchOptions,
	): Promise<WebSearchResult> {
		const config = loadConfig();
		const apiKey = getApiKey(config, this.id);

		if (!apiKey) {
			throw new Error("Serper API key not configured");
		}

		const { signal, clearTimeout } = abortAfterAny(options.timeout || 25000);

		try {
			const response = await fetch(
				`${API_CONFIG.SERPER.BASE_URL}${API_CONFIG.SERPER.SEARCH_ENDPOINT}`,
				{
					method: "POST",
					headers: {
						"X-API-Key": apiKey,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						q: query,
						num: options.numResults || 10,
					}),
					signal,
				},
			);

			clearTimeout();

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Serper search error (${response.status}): ${errorText}`,
				);
			}

			const data = (await response.json()) as SerperResponse;
			const results = data.organic ?? [];

			if (results.length === 0) {
				return {
					output: "No search results found.",
					provider: this.id,
				};
			}

			return {
				output: formatSerperResults(results, options.numResults || 10),
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