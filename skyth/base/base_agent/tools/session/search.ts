import { BaseTool } from "@/base/tool";
import type { SessionManager } from "@/session/manager";
import type { MemoryStore } from "@/base/base_agent/memory/store";
import { searchSessionMessages } from "@/base/base_agent/tools/session_tool_helpers";

export class SessionSearchTool extends BaseTool {
	constructor(
		private sessions: SessionManager,
		private memory: MemoryStore,
	) {
		super();
	}

	get name(): string {
		return "session_search";
	}

	get description(): string {
		return "Search across all sessions in the graph for messages matching a query.";
	}

	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				query: { type: "string", description: "Search query" },
				limit: {
					type: "number",
					description: "Maximum number of results",
					default: 5,
				},
			},
			required: ["query"],
		};
	}

	async execute(params: Record<string, any>): Promise<string> {
		const query = String(params.query);
		const limit = Number(params.limit) || 5;

		const sessions = this.sessions.graph.getSessionList();
		const loadedSessions = await this.sessions.getMany(sessions.map(s => s.key));
		const results = searchSessionMessages(
			loadedSessions.map(session => ({
				key: session.key,
				messages: session.messages,
			})),
			query,
			limit,
		);

		if (results.length === 0) {
			return `No results found for '${query}' across ${sessions.length} sessions.`;
		}

		const output = results
			.slice(0, limit)
			.map((r) => `[${r.session}] ${r.role}: ${r.content}`)
			.join("\n");

		return `Found ${results.length} results:\n\n${output}`;
	}
}
