import type { LoadHook } from "@/gateway/core/contracts/index.ts";

export const auditHook: LoadHook = {
	name: "audit.load",
	phase: "postload",
	appliesTo: ["tool", "pipeline", "skill", "mcp", "agent"],
	run(candidate) {
		return {
			ok: true,
			hook: this.name,
			phase: this.phase,
			severity: "info",
			message: `Audited ${candidate.source.kind}:${candidate.kind}:${candidate.name}`,
			details: { source: candidate.source.label || candidate.source.root },
		};
	},
};
