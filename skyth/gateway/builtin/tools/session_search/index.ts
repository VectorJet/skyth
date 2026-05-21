import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { getMemoryStore } from "@/gateway/memory/store.ts";

export const sessionSearchTool: ToolDefinition = {
	name: "session:search",
	description: `Search Claude chat sessions by title, summary, and indexed thread content.

Returns threadId values that can be passed to thread:read or thread:handoff. Use sort to browse by date/name/message count even without a query.`,
	parameters: [
		{
			name: "query",
			description:
				"Optional semantic/natural-language query. If omitted, sessions are listed by sort order.",
			type: "string",
			required: false,
		},
		{
			name: "limit",
			description: "Maximum sessions to return. Defaults to 10, max 50.",
			type: "number",
			required: false,
		},
		{
			name: "sort",
			description:
				"Sort order: relevance, updated_desc, updated_asc, created_desc, created_asc, name_asc, name_desc, messages_desc.",
			type: "string",
			required: false,
		},
	],
	handler: async (args) => {
		const sort =
			args.sort === "relevance" ||
			args.sort === "updated_desc" ||
			args.sort === "updated_asc" ||
			args.sort === "created_desc" ||
			args.sort === "created_asc" ||
			args.sort === "name_asc" ||
			args.sort === "name_desc" ||
			args.sort === "messages_desc"
				? args.sort
				: undefined;
		const sessions = await getMemoryStore().searchSessions({
			query: typeof args.query === "string" ? args.query : undefined,
			limit: typeof args.limit === "number" ? args.limit : undefined,
			sort,
		});
		return { sessions, count: sessions.length };
	},
	metadata: {
		category: "memory",
		tags: ["session", "thread", "search", "claude"],
		version: "1.0.0",
		author: "system",
	},
};
