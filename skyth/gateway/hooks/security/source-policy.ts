import * as path from "path";
import type { LoadHook } from "@/gateway/core/contracts/index.ts";

export const sourcePolicyHook: LoadHook = {
	name: "security.source-policy",
	phase: "security",
	appliesTo: ["tool", "pipeline", "skill", "mcp", "agent"],
	run(candidate) {
		const normalizedRoot = path.resolve(candidate.root);
		const normalizedSourceRoot = path.resolve(candidate.source.root);
		const relativeToSource = path.relative(
			normalizedSourceRoot,
			normalizedRoot,
		);
		if (
			relativeToSource.startsWith("..") ||
			path.isAbsolute(relativeToSource)
		) {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: "Candidate root must stay inside its load source.",
			};
		}
		if (
			candidate.files.some(
				(file) =>
					path.normalize(file).startsWith("..") || path.isAbsolute(file),
			)
		) {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: "Candidate root may not traverse upward.",
			};
		}
		if (candidate.source.kind === "builtin" && candidate.source.writable) {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: "Builtin sources must not be writable.",
			};
		}
		return {
			ok: true,
			hook: this.name,
			phase: this.phase,
			severity: "info",
			message: "Source policy passed.",
		};
	},
};
