import { getMemoryStore } from "@/gateway/memory/store.ts";

function resultUrl(threadId: string): string {
	return `claude-gateway://thread/${encodeURIComponent(threadId)}`;
}

export const chatGptSearchTool = {
	name: "search",
	description:
		"Search indexed Claude Gateway conversations and memories. Returns result IDs that can be passed to fetch for full content.",
	inputSchema: {
		type: "object",
		properties: {
			query: {
				type: "string",
				description: "Natural-language search query.",
			},
		},
		required: ["query"],
	},
	outputSchema: {
		type: "object",
		properties: {
			results: {
				type: "array",
				items: {
					type: "object",
					properties: {
						id: { type: "string" },
						title: { type: "string" },
						url: { type: "string" },
					},
					required: ["id", "title", "url"],
				},
			},
		},
		required: ["results"],
	},
};

export async function handleChatGptSearch(args: Record<string, any>) {
	const query = String(args.query ?? "").trim();
	if (!query) throw new Error("query is required");

	const hits = await getMemoryStore().searchAuto(query, 20, "bm25");
	const seen = new Set<string>();
	const results = [];

	for (const hit of hits) {
		if (seen.has(hit.threadId)) continue;
		seen.add(hit.threadId);
		results.push({
			id: hit.threadId,
			title: hit.title || "(untitled)",
			url: resultUrl(hit.threadId),
		});
	}

	return { results };
}

export { resultUrl as chatGptResultUrl };
