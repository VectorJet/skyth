import { BaseTool } from "@/base/tool";
import type { SessionManager } from "@/session/manager";
import { validateSessionKey } from "@/base/base_agent/tools/session_tool_helpers";

export class SessionLinkTool extends BaseTool {
	constructor(
		private sessions: SessionManager,
		private currentKeyFn: () => string,
	) {
		super();
	}

	get name(): string {
		return "session_link";
	}

	get description(): string {
		return "Link two sessions together without merging their messages. Creates a relationship in the session graph.";
	}

	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				target: {
					type: "string",
					description:
						"Target session key to link with (e.g., 'telegram:67890')",
				},
			},
			required: ["target"],
		};
	}

	async execute(params: Record<string, any>): Promise<string> {
		const targetKey = String(params.target);
		const currentKey = this.currentKeyFn();

		const keyError = validateSessionKey(targetKey);
		if (keyError) return keyError;

		const currentKeys = this.sessions.graph.getSessionKeys();
		if (!currentKeys.includes(targetKey)) {
			return `Error: Session '${targetKey}' not found. Available sessions: ${currentKeys.join(", ") || "none"}`;
		}

		this.sessions.graph.link(currentKey, targetKey);
		this.sessions.graph.saveAll();

		return `Linked current session with '${targetKey}'.`;
	}
}
