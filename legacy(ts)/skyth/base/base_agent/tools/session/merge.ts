import { BaseTool } from "@/base/tool";
import type { SessionManager } from "@/session/manager";
import {
	buildCompactMergeSummary,
	validateSessionKey,
} from "@/base/base_agent/tools/session_tool_helpers";

export class SessionMergeTool extends BaseTool {
	constructor(
		private sessions: SessionManager,
		private currentKeyFn: () => string,
	) {
		super();
	}

	get name(): string {
		return "session_merge";
	}

	get description(): string {
		return "Manually merge another session's context into the current session. Use this to pull context from another channel into the current conversation.";
	}

	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				source: {
					type: "string",
					description:
						"Source session key to merge from (e.g., 'discord:12345')",
				},
				mode: {
					type: "string",
					enum: ["compact", "full"],
					description:
						"Merge mode: 'compact' (summarizes source) or 'full' (includes all messages)",
					default: "compact",
				},
			},
			required: ["source"],
		};
	}

	async execute(params: Record<string, any>): Promise<string> {
		const sourceKey = String(params.source);
		const mode = params.mode === "full" ? "full" : "compact";
		const targetKey = this.currentKeyFn();

		const keyError = validateSessionKey(sourceKey);
		if (keyError) return keyError;

		if (sourceKey === targetKey) {
			return "Error: Cannot merge a session into itself.";
		}

		const currentKeys = this.sessions.graph.getSessionKeys();
		if (!currentKeys.includes(sourceKey)) {
			return `Error: Session '${sourceKey}' not found. Available sessions: ${currentKeys.join(", ") || "none"}`;
		}

		const sourceSession = this.sessions.getOrCreate(sourceKey);
		const targetSession = this.sessions.getOrCreate(targetKey);
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
			const summary = buildCompactMergeSummary(
				sourceKey,
				sourceSession.messages,
			);
			targetSession.messages.unshift({
				role: "system",
				content: summary,
				timestamp: new Date().toISOString(),
				_mergedFrom: sourceKey,
			});
		}

		this.sessions.save(targetSession);
		this.sessions.graph.merge(sourceKey, targetKey, mode, messageCount);
		this.sessions.graph.saveAll();

		return `Merged ${messageCount} messages from '${sourceKey}' into current session (mode: ${mode}).`;
	}
}
