export interface WarnEvent {
	sessionKey: string;
	message: string;
}

export const WARN_TYPE = "warn";

export function createWarnEvent(
	sessionKey: string,
	message: string,
): WarnEvent {
	return {
		sessionKey,
		message,
	};
}
