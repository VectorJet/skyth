/**
 * @tool session_search
 * @author skyth-team
 * @version 1.0.0
 * @description Search across all sessions in the graph for messages matching a query.
 * @tags session
 */
import { defineTool } from "@/sdks/agent-sdk/tools";
import type { ToolExecutionContext } from "@/base/base_agent/tools/context";

export default defineTool({
	name: "session_search",
	description:
		"Search across all sessions in the graph for messages matching a query.",
	parameters: {
		type: "object",
		properties: {
			query: { type: "string", description: "Search query" },
			limit: { type: "number", description: "Maximum number of results" },
		},
		required: ["query"],
	},
	async execute(
		params: Record<string, any>,
		ctx?: ToolExecutionContext,
	): Promise<string> {
		if (!ctx?.sessions) return "Error: Session manager not available";
		const query = String(params.query);
		const limit = Number(params.limit) || 5;

		const sessions = ctx.sessions.graph.getSessionList();
		const results: Array<{ session: string; role: string; content: string }> =
			[];

		const loadedSessions = await ctx.sessions.getMany(sessions.map(s => s.key));

		for (const s of loadedSessions) {
			const key = s.key;
			for (const msg of s.messages) {
				const content =
					typeof msg.content === "string"
						? msg.content
						: JSON.stringify(msg.content);
				if (content.toLowerCase().includes(query.toLowerCase())) {
					results.push({
						session: key,
						role: msg.role,
						content: content.slice(0, 200),
					});
					if (results.length >= limit * sessions.length) break;
				}
			}
		}

		if (results.length === 0) {
			return `No results found for '${query}' across ${sessions.length} sessions.`;
		}

		const output = results
			.slice(0, limit)
			.map((r) => `[${r.session}] ${r.role}: ${r.content}`)
			.join("\n");

		return `Found ${results.length} results:\n\n${output}`;
	},
});
