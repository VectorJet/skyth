export interface LoopEvent {
	sessionKey: string;
	toolName: string;
}

export const LOOP_TYPE = "loop";

export function createLoopEvent(
	sessionKey: string,
	toolName: string,
): LoopEvent {
	return {
		sessionKey,
		toolName,
	};
}
