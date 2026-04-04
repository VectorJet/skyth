export interface ToolEvent {
	runId: string;
	sessionKey: string;
	toolName: string;
}

export const TOOL_TYPE = "tool";

export function createToolEvent(
	sessionKey: string,
	toolName: string,
	runId: string,
): ToolEvent {
	return {
		runId,
		sessionKey,
		toolName,
	};
}
