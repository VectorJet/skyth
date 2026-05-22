import type { AgentTier } from "@/base/base_agent/agent";

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

export interface DelegationFrame {
	agentId: string;
	tier: AgentTier;
	timestampMs: number;
}

export class DelegationController {
	private readonly stack: DelegationFrame[] = [];

	constructor(private readonly maxDepth = 2) {}

	canDelegate(params: {
		caller: string;
		callee: string;
		callerTier: AgentTier;
	}): DelegationCheckResult {
		if (params.callerTier === "subagent") {
			return {
				allowed: false,
				code: "subagent_no_delegate",
				reason: `Subagent '${params.caller}' cannot delegate`,
			};
		}

		if (this.depth >= this.maxDepth) {
			return {
				allowed: false,
				code: "max_depth_exceeded",
				reason: `Delegation depth ${this.depth} exceeds max depth ${this.maxDepth}`,
			};
		}

		const callerIndex = this.stack.findIndex(
			(frame) => frame.agentId === params.caller,
		);
		if (this.stack.length > 0 && callerIndex === -1) {
			return {
				allowed: false,
				code: "caller_not_in_stack",
				reason: `Caller '${params.caller}' is not in current call stack`,
			};
		}

		if (this.stack.some((frame) => frame.agentId === params.callee)) {
			const earlier =
				callerIndex >= 0
					? this.stack
							.slice(0, callerIndex)
							.some((frame) => frame.agentId === params.callee)
					: false;
			return {
				allowed: false,
				code: earlier ? "circular_call" : "already_visited",
				reason: `${params.caller} cannot call ${params.callee} in this execution path`,
			};
		}

		return { allowed: true, code: "ok", reason: "Delegation allowed" };
	}

	push(agentId: string, tier: AgentTier): void {
		this.stack.push({ agentId, tier, timestampMs: Date.now() });
	}

	pop(): DelegationFrame | undefined {
		return this.stack.pop();
	}

	clear(): void {
		this.stack.length = 0;
	}

	snapshot(): DelegationFrame[] {
		return [...this.stack];
	}

	get depth(): number {
		return this.stack.length;
	}
}
