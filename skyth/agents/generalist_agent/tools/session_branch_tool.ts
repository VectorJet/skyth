/**
 * @tool session_branch
 * @author skyth-team
 * @version 1.0.0
 * @description Show the current session graph, visualizing relationships between sessions across channels.
 * @tags session
 */
import { defineTool } from "@/sdks/agent-sdk/tools";
import type { ToolExecutionContext } from "@/base/base_agent/tools/context";

export default defineTool({
	name: "session_branch",
	description:
		"Show the current session graph, visualizing relationships between sessions across channels.",
	parameters: {
		type: "object",
		properties: {},
	},
	async execute(
		_params: Record<string, any>,
		ctx?: ToolExecutionContext,
	): Promise<string> {
		if (!ctx?.sessions) return "Error: Session manager not available";
		return ctx.sessions.graph.visualize();
	},
});
