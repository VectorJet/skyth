import { BaseTool } from "@/base/tool";
import type { SessionManager } from "@/session/manager";
import { validateSessionKey } from "@/base/base_agent/tools/session_tool_helpers";

export class SessionReadTool extends BaseTool {
	constructor(private sessions: SessionManager) {
		super();
	}

	get name(): string {
		return "session_read";
	}

	get description(): string {
		return "Read full context from another session without merging. Useful to check what happened on another channel.";
	}

	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				session: {
					type: "string",
					description: "Session key to read (e.g., 'discord:12345')",
				},
				limit: {
					type: "number",
					description: "Maximum number of recent messages to show",
					default: 10,
				},
			},
			required: ["session"],
		};
	}

	async execute(params: Record<string, any>): Promise<string> {
		const sessionKey = String(params.session);
		const limit = Number(params.limit) || 10;

		const keyError = validateSessionKey(sessionKey);
		if (keyError) return keyError;

		const session = this.sessions.getOrCreate(sessionKey);
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
	}
}
