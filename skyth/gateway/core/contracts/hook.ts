import type { CapabilityKind } from "@/gateway/core/contracts/capability.ts";
import type { LoadCandidate } from "@/gateway/core/contracts/candidate.ts";

export type HookPhase =
	| "preload"
	| "validate"
	| "security"
	| "policy"
	| "test"
	| "register"
	| "postload";
export type HookSeverity = "info" | "warning" | "error";

export interface HookResult {
	ok: boolean;
	hook: string;
	phase: HookPhase;
	severity?: HookSeverity;
	message?: string;
	details?: unknown;
}

export interface LoadHook {
	name: string;
	phase: HookPhase;
	appliesTo: CapabilityKind[];
	run(candidate: LoadCandidate): Promise<HookResult> | HookResult;
}

export interface HookRunReport {
	candidate: Pick<LoadCandidate, "kind" | "name" | "root">;
	ok: boolean;
	enforced: boolean;
	results: HookResult[];
}
