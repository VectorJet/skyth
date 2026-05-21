import type {
	HookRunReport,
	LoadCandidate,
	LoadHook,
} from "@/gateway/core/contracts/index.ts";

export interface HookManagerOptions {
	enforce?: boolean;
}

const PHASE_ORDER = [
	"preload",
	"validate",
	"security",
	"policy",
	"test",
	"register",
	"postload",
] as const;

export class HookManager {
	private hooks: LoadHook[] = [];

	constructor(private options: HookManagerOptions = {}) {}

	register(hook: LoadHook): void {
		this.hooks.push(hook);
	}

	list(): LoadHook[] {
		return [...this.hooks].sort(
			(a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase),
		);
	}

	async run(candidate: LoadCandidate): Promise<HookRunReport> {
		const applicable = this.list().filter((hook) =>
			hook.appliesTo.includes(candidate.kind),
		);
		const results = [];
		for (const hook of applicable) {
			try {
				results.push(await hook.run(candidate));
			} catch (error: any) {
				results.push({
					ok: false,
					hook: hook.name,
					phase: hook.phase,
					severity: "error" as const,
					message: error?.message || String(error),
				});
			}
		}

		const ok = results.every(
			(result) => result.ok || result.severity !== "error",
		);
		if (!ok && this.options.enforce) {
			const failed = results
				.filter((result) => !result.ok)
				.map((result) => `${result.hook}: ${result.message ?? "failed"}`)
				.join("; ");
			throw new Error(
				`Load candidate ${candidate.kind}:${candidate.name} failed hooks: ${failed}`,
			);
		}

		return {
			candidate: {
				kind: candidate.kind,
				name: candidate.name,
				root: candidate.root,
			},
			ok,
			enforced: Boolean(this.options.enforce),
			results,
		};
	}
}
