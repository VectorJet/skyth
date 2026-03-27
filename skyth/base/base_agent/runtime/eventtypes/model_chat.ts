export interface ModelChatEvent {
	runId: string;
	sessionKey: string;
}

export const MODEL_CHAT_TYPE = "model.chat";

export function createModelChatEvent(sessionKey: string): ModelChatEvent {
	return {
		runId: crypto.randomUUID(),
		sessionKey,
	};
}
