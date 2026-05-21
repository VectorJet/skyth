import type { LoadHook } from "@/gateway/core/contracts/index.ts";

export const localPolicyHook: LoadHook = {
	name: "policy.local-generated",
	phase: "policy",
	appliesTo: ["tool", "pipeline", "skill", "mcp", "agent"],
	run(candidate) {
		if (
			(candidate.source.kind === "temporary" ||
				candidate.source.kind === "generated") &&
			candidate.source.trustLevel !== "generated"
		) {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: "Temporary/generated sources must use generated trust.",
			};
		}
		return {
			ok: true,
			hook: this.name,
			phase: this.phase,
			severity: "info",
			message: "Local/generated policy passed.",
		};
	},
};
