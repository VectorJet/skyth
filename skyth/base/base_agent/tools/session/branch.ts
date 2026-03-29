import { BaseTool } from "@/base/tool";
import type { SessionManager } from "@/session/manager";

export class SessionBranchTool extends BaseTool {
	constructor(private sessions: SessionManager) {
		super();
	}

	get name(): string {
		return "session_branch";
	}

	get description(): string {
		return "Show the current session graph, visualizing relationships between sessions across channels.";
	}

	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {},
		};
	}

	async execute(): Promise<string> {
		return this.sessions.graph.visualize();
	}
}
