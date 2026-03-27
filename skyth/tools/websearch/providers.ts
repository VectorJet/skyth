import type { Config } from "@/config/schema";
import { loadConfig } from "@/config/loader";
import { abortAfterAny } from "@/utils/abort";
import {
	formatBraveResults,
	formatSerpApiResults,
	formatSerperResults,
	pickConfiguredProviderIds,
} from "@/tools/websearch/provider_helpers";

export interface WebSearchProvider {
	readonly id: string;
	readonly name: string;
	search(query: string, options: WebSearchOptions): Promise<WebSearchResult>;
}

export interface WebSearchOptions {
	numResults?: number;
	timeout?: number;
}

export interface WebSearchResult {
	output: string;
	provider: string;
}

type ExaMcpResponse = {
	result?: {
		content?: Array<{
			text?: string;
		}>;
	};
};

type SerperItem = {
	title?: string;
	url?: string;
	snippet?: string;
};

type SerperResponse = {
	organic?: SerperItem[];
};

type SerpApiItem = {
	title?: string;
	link?: string;
	snippet?: string;
};

type SerpApiResponse = {
	organic_results?: SerpApiItem[];
};

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
	EXA: {
		BASE_URL: "https://mcp.exa.ai",
		ENDPOINT: "/mcp",
		DEFAULT_NUM_RESULTS: 8,
	},
	SERPER: {
		BASE_URL: "https://google.serper.dev",
		SEARCH_ENDPOINT: "/search",
	},
	SERPAPI: {
		BASE_URL: "https://serpapi.com",
		SEARCH_ENDPOINT: "/search",
	},
	BRAVE: {
		BASE_URL: "https://api.search.brave.com",
		SEARCH_ENDPOINT: "/res/v1/web/search",
		DEFAULT_NUM_RESULTS: 10,
	},
} as const;

function getApiKey(config: Config, provider: string): string | undefined {
	return config.websearch.providers[provider]?.api_key;
}

function getApiBase(config: Config, provider: string): string | undefined {
	return config.websearch.providers[provider]?.api_base;
}

export class ExaSearchProvider implements WebSearchProvider {
	readonly id = "exa";
	readonly name = "Exa";

	async search(
		query: string,
		options: WebSearchOptions,
	): Promise<WebSearchResult> {
		const config = loadConfig();
		const apiKey = getApiKey(config, this.id);

		if (!apiKey) {
			throw new Error("Exa API key not configured");
		}

		const searchRequest = {
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: {
				name: "web_search_exa",
				arguments: {
					query,
					type: "auto",
					numResults: options.numResults || API_CONFIG.EXA.DEFAULT_NUM_RESULTS,
					livecrawl: "fallback",
				},
			},
		};

		const { signal, clearTimeout } = abortAfterAny(options.timeout || 25000);

		try {
			const response = await fetch(
				`${API_CONFIG.EXA.BASE_URL}${API_CONFIG.EXA.ENDPOINT}`,
				{
					method: "POST",
					headers: {
						accept: "application/json, text/event-stream",
						"content-type": "application/json",
						"x-api-key": apiKey,
					},
					body: JSON.stringify(searchRequest),
					signal,
				},
			);

			clearTimeout();

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Exa search error (${response.status}): ${errorText}`);
			}

			const responseText = await response.text();
			const lines = responseText.split("\n");
			for (const line of lines) {
				if (line.startsWith("data: ")) {
					const data = JSON.parse(line.substring(6)) as ExaMcpResponse;
					const first = data.result?.content?.[0];
					if (first?.text) {
						return {
							output: first.text,
							provider: this.id,
						};
					}
				}
			}

			return {
				output: "No search results found.",
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
