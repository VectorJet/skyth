/**
 * @tool session_read
 * @author skyth-team
 * @version 1.0.0
 * @description Read full context from another session without merging.
 * @tags session
 */
import { defineTool } from "@/sdks/agent-sdk/tools";
import type { ToolExecutionContext } from "@/base/base_agent/tools/context";

export default defineTool({
	name: "session_read",
	description:
		"Read full context from another session without merging. Useful to check what happened on another channel.",
	parameters: {
		type: "object",
		properties: {
			session: {
				type: "string",
				description: "Session key to read (e.g., 'discord:12345')",
			},
			limit: {
				type: "number",
				description: "Maximum number of recent messages to show",
			},
		},
		required: ["session"],
	},
	async execute(
		params: Record<string, any>,
		ctx?: ToolExecutionContext,
	): Promise<string> {
		if (!ctx?.sessions) return "Error: Session manager not available";
		const sessionKey = String(params.session);
		const limit = Number(params.limit) || 10;

		if (!sessionKey.includes(":")) {
			return "Error: Invalid session key format. Use 'channel:chatId' (e.g., 'discord:12345')";
		}

		const session = ctx.sessions.getOrCreate(sessionKey);
		const messages = session.messages.slice(-limit);

		if (messages.length === 0) {
			return `Session '${sessionKey}' is empty.`;
		}

		const lines: string[] = [`=== Session: ${sessionKey} ===`, ""];
		for (const msg of messages) {
			const content =
				typeof msg.content === "string"
					? msg.content
					: JSON.stringify(msg.content);
			lines.push(
				`[${msg.role}] ${content.slice(0, 300)}${content.length > 300 ? "..." : ""}`,
			);
			lines.push("");
		}

		return lines.join("\n");
	},
});
