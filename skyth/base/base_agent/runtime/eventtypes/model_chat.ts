export interface ModelChatEvent {
	runId: string;
	sessionKey: string;
}

export const MODEL_CHAT_TYPE = "model.chat";

export function createModelChatEvent(
	sessionKey: string,
	runId?: string,
): ModelChatEvent {
	return {
		runId: runId ?? crypto.randomUUID(),
		sessionKey,
	};
}
