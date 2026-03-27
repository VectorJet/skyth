/**
 * @tool session_link
 * @author skyth-team
 * @version 1.0.0
 * @description Link two sessions together without merging their messages.
 * @tags session
 */
import { defineTool } from "@/sdks/agent-sdk/tools";
import type { ToolExecutionContext } from "@/base/base_agent/tools/context";

export default defineTool({
	name: "session_link",
	description:
		"Link two sessions together without merging their messages. Creates a relationship in the session graph.",
	parameters: {
		type: "object",
		properties: {
			target: {
				type: "string",
				description: "Target session key to link with (e.g., 'telegram:67890')",
			},
		},
		required: ["target"],
	},
	async execute(
		params: Record<string, any>,
		ctx?: ToolExecutionContext,
	): Promise<string> {
		if (!ctx?.sessions) return "Error: Session manager not available";
		const targetKey = String(params.target);
		const currentKey = ctx.sessionKey;

		if (!targetKey.includes(":")) {
			return "Error: Invalid session key format. Use 'channel:chatId' (e.g., 'telegram:67890')";
		}

		const currentKeys = ctx.sessions.graph.getSessionKeys();
		if (!currentKeys.includes(targetKey)) {
			return `Error: Session '${targetKey}' not found. Available sessions: ${currentKeys.join(", ") || "none"}`;
		}

		ctx.sessions.graph.link(currentKey, targetKey);
		ctx.sessions.graph.saveAll();

		return `Linked current session with '${targetKey}'.`;
	},
});
