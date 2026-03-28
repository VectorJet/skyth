import { BaseTool } from "@/base/tool";
import type { SessionManager } from "@/session/manager";

export class SessionPurgeTool extends BaseTool {
	constructor(private sessions: SessionManager) {
		super();
	}

	get name(): string {
		return "session_purge";
	}

	get description(): string {
		return "Clear all session history and start fresh. This removes all messages and session graph relationships.";
	}

	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				force: {
					type: "boolean",
					description: "Skip confirmation",
					default: false,
				},
			},
		};
	}

	async execute(params: Record<string, any>): Promise<string> {
		const force = Boolean(params.force);

		if (!force) {
			return "Warning: This will delete all session history. Add 'force: true' to confirm.";
		}

		this.sessions.graph.clear();
		this.sessions.graph.saveAll();

		return "All sessions purged. Starting fresh.";
	}
}