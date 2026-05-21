import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { getMemoryStore } from "@/gateway/memory/store.ts";

export const threadSearchTool: ToolDefinition = {
	name: "thread:search",
	description: `Search indexed Claude thread content.

Use this when you need messages/chunks matching a query. Omit threadId to search across all imported Claude conversations and gateway memory, or provide threadId to search inside one specific Claude thread. Returned threadId values can be passed to thread:read or thread:handoff.`,
	parameters: [
		{
			name: "query",
			description:
				"Natural-language query to search for in indexed thread content.",
			type: "string",
			required: true,
		},
		{
			name: "threadId",
			description:
				"Optional Claude thread id to scope the search. Accepts bare UUID, claude:<uuid>, or current/latest.",
			type: "string",
			required: false,
		},
		{
			name: "limit",
			description: "Maximum hits to return. Defaults to 10, max 50.",
			type: "number",
			required: false,
		},
		{
			name: "mode",
			description:
				"Search mode: auto, semantic, or bm25. auto uses semantic search when embeddings are available.",
			type: "string",
			required: false,
		},
	],
	handler: async (args) => {
		const query = String(args.query ?? "").trim();
		if (!query) throw new Error("query is required");

		const limit = Math.max(
			1,
			Math.min(50, typeof args.limit === "number" ? args.limit : 10),
		);
		const mode =
			args.mode === "semantic" || args.mode === "bm25" ? args.mode : "auto";
		const memory = getMemoryStore();
		const threadId =
			typeof args.threadId === "string" ? args.threadId.trim() : "";

		if (threadId) {
			const hits = await memory.searchThread({ threadId, query, limit, mode });
			return { count: hits.length, hits };
		}

		const hits = await memory.searchAuto(query, limit, mode);
		const stats = memory.stats();
		return {
			stats: {
				conversations: stats.conversations,
				chunks: stats.chunks,
				embeddings: stats.embeddings,
			},
			count: hits.length,
			hits,
		};
	},
	metadata: {
		category: "memory",
		tags: ["thread", "session", "search", "memory", "claude"],
		version: "1.0.0",
		author: "system",
	},
};
