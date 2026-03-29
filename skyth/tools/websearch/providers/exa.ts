import type {
	WebSearchProvider,
	WebSearchOptions,
	WebSearchResult,
} from "./types";
import { loadConfig } from "@/config/loader";
import type { Config } from "@/config/schema";
import { abortAfterAny } from "@/utils/abort";
import { formatExaResults } from "../provider_helpers";

type ExaMcpResponse = {
	result?: {
		content?: Array<{
			text?: string;
		}>;
	};
};

const API_CONFIG = {
	EXA: {
		BASE_URL: "https://mcp.exa.ai",
		ENDPOINT: "/mcp",
		DEFAULT_NUM_RESULTS: 8,
	},
} as const;

function getApiKey(config: Config, provider: string): string | undefined {
	return config.websearch.providers[provider]?.api_key;
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
							output: formatExaResults(first.text),
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
