/**
 * @tool session_merge
 * @author skyth-team
 * @version 1.0.0
 * @description Manually merge another session's context into the current session.
 * @tags session
 */
import { defineTool } from "@/sdks/agent-sdk/tools";
import type { ToolExecutionContext } from "@/base/base_agent/tools/context";

export default defineTool({
	name: "session_merge",
	description:
		"Manually merge another session's context into the current session. Use this to pull context from another channel into the current conversation.",
	parameters: {
		type: "object",
		properties: {
			source: {
				type: "string",
				description: "Source session key to merge from (e.g., 'discord:12345')",
			},
			mode: {
				type: "string",
				enum: ["compact", "full"],
				description:
					"Merge mode: 'compact' (summarizes source) or 'full' (includes all messages)",
			},
		},
		required: ["source"],
	},
	async execute(
		params: Record<string, any>,
		ctx?: ToolExecutionContext,
	): Promise<string> {
		if (!ctx?.sessions) return "Error: Session manager not available";
		const sourceKey = String(params.source);
		const mode = params.mode === "full" ? "full" : "compact";
		const targetKey = ctx.sessionKey;

		if (!sourceKey.includes(":")) {
			return "Error: Invalid session key format. Use 'channel:chatId' (e.g., 'discord:12345')";
		}
		if (sourceKey === targetKey) {
			return "Error: Cannot merge a session into itself.";
		}

		const currentKeys = ctx.sessions.graph.getSessionKeys();
		if (!currentKeys.includes(sourceKey)) {
			return `Error: Session '${sourceKey}' not found. Available sessions: ${currentKeys.join(", ") || "none"}`;
		}

		const sourceSession = ctx.sessions.getOrCreate(sourceKey);
		const targetSession = ctx.sessions.getOrCreate(targetKey);
		const messageCount = sourceSession.messages.length;

		if (messageCount === 0) {
			return `Error: Session '${sourceKey}' has no messages to merge.`;
		}

		if (mode === "full") {
			const sourceMessages = sourceSession.getHistory().map((m) => ({
				...m,
				_mergedFrom: sourceKey,
			}));
			targetSession.messages.unshift(...sourceMessages);
		} else {
			const recentMessages = sourceSession.messages.slice(-10);
			const userMsgs = recentMessages
				.filter((m) => m.role === "user")
				.map((m) => m.content);
			const lastUserMsg = userMsgs[userMsgs.length - 1];
			const lastUser = lastUserMsg ? String(lastUserMsg).slice(0, 200) : "";
			const summary = `=== SESSION MERGE ===\nSource: ${sourceKey}\nMessages: ${messageCount}\nLast user message: "${lastUser}"\n=== END MERGE ===`;
			targetSession.messages.unshift({
				role: "system",
				content: summary,
				timestamp: new Date().toISOString(),
				_mergedFrom: sourceKey,
			});
		}

		ctx.sessions.save(targetSession);
		ctx.sessions.graph.merge(sourceKey, targetKey, mode, messageCount);
		ctx.sessions.graph.saveAll();

		return `Merged ${messageCount} messages from '${sourceKey}' into current session (mode: ${mode}).`;
	},
});
