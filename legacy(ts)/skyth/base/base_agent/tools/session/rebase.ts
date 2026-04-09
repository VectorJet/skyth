import { BaseTool } from "@/base/tool";
import type { SessionManager } from "@/session/manager";
import { validateSessionKey } from "@/base/base_agent/tools/session_tool_helpers";

export class SessionRebaseTool extends BaseTool {
	constructor(
		private sessions: SessionManager,
		private currentKeyFn: () => string,
	) {
		super();
	}

	get name(): string {
		return "session_rebase";
	}

	get description(): string {
		return "Rebase current session on another session's history. Like git rebase - replays current messages on top of source session.";
	}

	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				source: {
					type: "string",
					description:
						"Source session key to rebase onto (e.g., 'discord:12345')",
				},
			},
			required: ["source"],
		};
	}

	async execute(params: Record<string, any>): Promise<string> {
		const sourceKey = String(params.source);
		const targetKey = this.currentKeyFn();

		const keyError = validateSessionKey(sourceKey);
		if (keyError) return keyError;

		const currentKeys = this.sessions.graph.getSessionKeys();
		if (!currentKeys.includes(sourceKey)) {
			return `Error: Session '${sourceKey}' not found.`;
		}

		const sourceSession = this.sessions.getOrCreate(sourceKey);
		const targetSession = this.sessions.getOrCreate(targetKey);
		const sourceMessages = sourceSession.getHistory();
		const currentMessages = [...targetSession.messages];

		targetSession.messages = [...sourceMessages, ...currentMessages];
		this.sessions.save(targetSession);

		this.sessions.graph.merge(
			sourceKey,
			targetKey,
			"full",
			sourceSession.messages.length,
		);
		this.sessions.graph.saveAll();

		return `Rebased current session on '${sourceKey}' with ${sourceSession.messages.length} messages.`;
	}
}
