import { BaseTool } from "@/base/tool";
import type { SessionManager } from "@/session/manager";
import { formatSessionList } from "@/base/base_agent/tools/session_tool_helpers";

export class SessionListTool extends BaseTool {
	constructor(private sessions: SessionManager) {
		super();
	}

	get name(): string {
		return "session_list";
	}

	get description(): string {
		return "List all sessions with their token counts. Use this to see how much context each channel's session has.";
	}

	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {},
		};
	}

	async execute(): Promise<string> {
		const sessions = this.sessions.graph.getSessionList();
		const stats = Object.fromEntries(
			sessions.map(({ key }) => {
				const session = this.sessions.getOrCreate(key);
				return [
					key,
					{
						messageCount: session.messages.length,
						tokenCount: session.estimateTokenCount(),
					},
				];
			}),
		);
		return formatSessionList(sessions, stats);
	}
}
