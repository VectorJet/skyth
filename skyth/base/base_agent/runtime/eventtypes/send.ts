export interface SendEvent {
	sessionKey: string;
	content: string;
}

export const SEND_TYPE = "send";

export function createSendEvent(
	sessionKey: string,
	content: string,
): SendEvent {
	return {
		sessionKey,
		content,
	};
}
