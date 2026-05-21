import * as fs from "fs/promises";
import type { LoadHook } from "@/gateway/core/contracts/index.ts";

export const smokeTestHook: LoadHook = {
	name: "tests.smoke",
	phase: "test",
	appliesTo: ["tool", "pipeline", "skill", "mcp", "agent"],
	async run(candidate) {
		if (!candidate.entryPath) {
			return {
				ok: true,
				hook: this.name,
				phase: this.phase,
				severity: "info",
				message: "No executable entrypoint to smoke test.",
			};
		}
		try {
			const stat = await fs.stat(candidate.entryPath);
			if (!stat.isFile() || stat.size === 0) {
				return {
					ok: false,
					hook: this.name,
					phase: this.phase,
					severity: "error",
					message: "Entrypoint must be a non-empty file.",
				};
			}
			const source = await fs.readFile(candidate.entryPath, "utf8");
			if (
				candidate.entryPath.endsWith(".ts") ||
				candidate.entryPath.endsWith(".js")
			) {
				if (!/export\s+(const|default|async function|function)/.test(source)) {
					return {
						ok: false,
						hook: this.name,
						phase: this.phase,
						severity: "error",
						message: "Entrypoint must export a loadable definition.",
					};
				}
			}
			if (candidate.entryPath.endsWith(".py") && !/--metadata/.test(source)) {
				return {
					ok: false,
					hook: this.name,
					phase: this.phase,
					severity: "error",
					message: "Python entrypoint must support --metadata smoke checks.",
				};
			}
			return {
				ok: true,
				hook: this.name,
				phase: this.phase,
				severity: "info",
				message: "Smoke test passed.",
			};
		} catch (error: any) {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: `Smoke test failed: ${error?.message || error}`,
			};
		}
	},
};
