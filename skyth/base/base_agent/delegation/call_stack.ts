import type {
	CallStackEntry,
	DelegationCheckResult,
	DelegationNodeType,
} from "@/base/base_agent/delegation/types";

export class DelegationCallStack {
	private readonly stack: CallStackEntry[] = [];

	constructor(private readonly maxDepth = 2) {}

	canDelegate(params: {
		caller: string;
		callee: string;
		callerType: DelegationNodeType;
	}): DelegationCheckResult {
		if (params.callerType === "subagent") {
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
			(item) => item.agentId === params.caller,
		);
		if (this.stack.length > 0 && callerIndex === -1) {
			return {
				allowed: false,
				code: "caller_not_in_stack",
				reason: `Caller '${params.caller}' is not in current call stack`,
			};
		}

		if (this.stack.some((item) => item.agentId === params.callee)) {
			const earlier =
				callerIndex >= 0
					? this.stack
							.slice(0, callerIndex)
							.some((item) => item.agentId === params.callee)
					: false;

			if (earlier) {
				return {
					allowed: false,
					code: "circular_call",
					reason: `${params.caller} cannot call ${params.callee} (circular reference detected)`,
				};
			}

			return {
				allowed: false,
				code: "already_visited",
				reason: `${params.callee} already appears in this execution path`,
			};
		}

		return { allowed: true, code: "ok", reason: "Delegation allowed" };
	}

	push(agentId: string, type: DelegationNodeType): void {
		this.stack.push({ agentId, type, timestampMs: Date.now() });
	}

	pop(): CallStackEntry | undefined {
		return this.stack.pop();
	}

	clear(): void {
		this.stack.length = 0;
	}

	snapshot(): CallStackEntry[] {
		return [...this.stack];
	}

	get depth(): number {
		return this.stack.length;
	}
}
