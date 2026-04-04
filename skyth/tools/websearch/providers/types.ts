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
