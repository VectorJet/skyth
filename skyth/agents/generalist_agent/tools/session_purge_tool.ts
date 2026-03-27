/**
 * @tool session_purge
 * @author skyth-team
 * @version 1.0.0
 * @description Clear all session history and start fresh.
 * @tags session
 */
import { defineTool } from "@/sdks/agent-sdk/tools";
import type { ToolExecutionContext } from "@/base/base_agent/tools/context";

export default defineTool({
	name: "session_purge",
	description:
		"Clear all session history and start fresh. This removes all messages and session graph relationships.",
	parameters: {
		type: "object",
		properties: {
			force: { type: "boolean", description: "Skip confirmation" },
		},
	},
	async execute(
		params: Record<string, any>,
		ctx?: ToolExecutionContext,
	): Promise<string> {
		const force = Boolean(params.force);

		if (!force) {
			return "Warning: This will delete all session history. Add 'force: true' to confirm.";
		}

		if (!ctx?.sessions) return "Error: Session manager not available";

		ctx.sessions.graph.clear();
		ctx.sessions.graph.saveAll();

		return "All sessions purged. Starting fresh.";
	},
});
