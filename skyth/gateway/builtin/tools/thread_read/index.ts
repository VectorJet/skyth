import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { getMemoryStore } from "@/gateway/memory/store.ts";

export const threadReadTool: ToolDefinition = {
	name: "thread:read",
	description: `Read a specific Claude thread by threadId, or search within it.

Use mode="head", "tail", or "range" for sed-like portions. Provide query to search within the thread instead of returning raw messages.`,
	parameters: [
		{
			name: "threadId",
			description:
				"Claude thread id. Accepts bare Claude UUID, claude:<uuid>, or current/latest.",
			type: "string",
			required: true,
		},
		{
			name: "query",
			description: "Optional query to search inside this thread.",
			type: "string",
			required: false,
		},
		{
			name: "mode",
			description: "Read mode: all, head, tail, range. Defaults to tail.",
			type: "string",
			required: false,
		},
		{
			name: "start",
			description: "Zero-based message offset for mode=range.",
			type: "number",
			required: false,
		},
		{
			name: "limit",
			description: "Maximum messages or hits. Defaults to 20.",
			type: "number",
			required: false,
		},
		{
			name: "searchMode",
			description:
				"Search mode when query is provided: auto, semantic, or bm25.",
			type: "string",
			required: false,
		},
		{
			name: "maxCharsPerMessage",
			description: "Maximum characters per returned message. Defaults to 8000.",
			type: "number",
			required: false,
		},
	],
	handler: async (args) => {
		const threadId = String(args.threadId ?? "").trim();
		if (!threadId) throw new Error("threadId is required");

		if (typeof args.query === "string" && args.query.trim()) {
			const mode =
				args.searchMode === "semantic" || args.searchMode === "bm25"
					? args.searchMode
					: "auto";
			const hits = await getMemoryStore().searchThread({
				threadId,
				query: args.query.trim(),
				limit: typeof args.limit === "number" ? args.limit : undefined,
				mode,
			});
			return { hits, count: hits.length };
		}

		const mode =
			args.mode === "all" || args.mode === "head" || args.mode === "range"
				? args.mode
				: "tail";
		return getMemoryStore().readThread({
			threadId,
			mode,
			start: typeof args.start === "number" ? args.start : undefined,
			limit: typeof args.limit === "number" ? args.limit : undefined,
			maxCharsPerMessage:
				typeof args.maxCharsPerMessage === "number"
					? args.maxCharsPerMessage
					: undefined,
		});
	},
	metadata: {
		category: "memory",
		tags: ["thread", "session", "read", "search", "claude"],
		version: "1.0.0",
		author: "system",
	},
};
