import { isExplicitCrossChannelRequest } from "@/session/router";
import type { Session, SessionMessage } from "@/session/manager";
import type { SessionManager } from "@/session/manager";
import { StickyBridgeController } from "@/base/base_agent/session/bridge";

const MERGE_MESSAGE_COUNT = 5;

export function buildCrossChannelMessages(
	sourceMessages: SessionMessage[],
	targetMessages: SessionMessage[],
	sourceKey: string,
	targetKey: string,
	x: number = 2,
): string {
	const sourceCount = Math.min(MERGE_MESSAGE_COUNT, sourceMessages.length);
	const targetCount = Math.min(MERGE_MESSAGE_COUNT - x, targetMessages.length);

	const lines: string[] = ["=== CROSS-CHANNEL CONTEXT ===", ""];

	if (targetCount > 0) {
		lines.push(`--- Current Channel (${targetKey}) ---`);
		const recentTarget = targetMessages.slice(-targetCount);
		for (const msg of recentTarget) {
			const content =
				typeof msg.content === "string"
					? msg.content
					: JSON.stringify(msg.content);
			lines.push(`[${msg.role}] ${content}`);
		}
		lines.push("");
	}

	lines.push(`--- Previous Channel (${sourceKey}) ---`);
	const recentSource = sourceMessages.slice(-sourceCount);
	for (const msg of recentSource) {
		const content =
			typeof msg.content === "string"
				? msg.content
				: JSON.stringify(msg.content);
		lines.push(`[${msg.role}] ${content}`);
	}

	lines.push("=== END CROSS-CHANNEL CONTEXT ===");
	return lines.join("\n");
}

export function buildCompactionPrompt(messages: SessionMessage[]): string {
	const messageTexts = messages
		.map((m) => {
			const content =
				typeof m.content === "string" ? m.content : JSON.stringify(m.content);
			return `[${m.role}] ${content.slice(0, 500)}`;
		})
		.join("\n\n");

	return `Summarize the following conversation messages concisely. Focus on:
1. Key topics discussed
2. Important decisions or conclusions
3. Any files or code that was worked on
4. User preferences or important context mentioned

Conversation:
${messageTexts}

Provide a concise summary (2-4 paragraphs) that captures the essential context:`;
}

export function consumePendingMergeIfRequested(params: {
	session: Session;
	targetKey: string;
	currentMessage: string;
	sessions: SessionManager;
	stickyBridge: StickyBridgeController;
	onLog?: (line: string) => void;
}): boolean {
	const pending = params.session.metadata?.pendingMerge as
		| { sourceKey?: string; sourceChannel?: string; timestamp?: number }
		| undefined;
	if (!pending) return false;

	const sourceKey = String(pending.sourceKey ?? "").trim();
	const sourceChannel = String(pending.sourceChannel ?? "").trim();
	if (!sourceKey || !sourceChannel) return false;
	if (!isExplicitCrossChannelRequest(params.currentMessage, sourceChannel))
		return false;

	const sourceSession = params.sessions.getOrCreate(sourceKey);
	if (sourceSession.messages.length === 0) return false;

	const mergedContent = buildCrossChannelMessages(
		sourceSession.messages,
		params.session.messages,
		sourceKey,
		params.targetKey,
	);
	params.session.messages.push({
		role: "system",
		content: `[CROSS-CHANNEL CONTEXT: USER-REQUESTED MERGE]\nSource: ${sourceKey}\n${mergedContent}\nInstruction: User explicitly requested cross-channel recall. Use this context as authoritative continuity.`,
		timestamp: new Date().toISOString(),
		_mergeMeta: {
			sourceChannel,
			sourceKey,
			decision: "continue",
		},
	});

	params.sessions.graph.merge(
		sourceKey,
		params.targetKey,
		"compact",
		sourceSession.messages.length,
	);
	delete params.session.metadata.pendingMerge;
	params.sessions.save(params.session);
	params.sessions.graph.saveAll();
	params.stickyBridge.activate(sourceKey, params.targetKey);
	params.onLog?.(
		`[session-graph] consumed pending merge ${sourceKey} -> ${params.targetKey} on explicit request`,
	);
	return true;
}
