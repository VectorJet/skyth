export type DelegationNodeType = "generalist" | "agent" | "subagent";
export type DelegationMode = "agent" | "subagent";

export interface DelegationRequest {
	caller: string;
	callee: string;
	callerType: DelegationNodeType;
	mode: DelegationMode;
	task: string;
	contextSnapshot?: string;
}

export interface TaskResult {
	ok: boolean;
	taskId: string;
	summary: string;
	details?: string;
	error?: string;
}

export interface CallStackEntry {
	agentId: string;
	type: DelegationNodeType;
	timestampMs: number;
}

export type DelegationRuleCode =
	| "ok"
	| "subagent_no_delegate"
	| "max_depth_exceeded"
	| "caller_not_in_stack"
	| "circular_call"
	| "already_visited";

export interface DelegationCheckResult {
	allowed: boolean;
	code: DelegationRuleCode;
	reason: string;
}
