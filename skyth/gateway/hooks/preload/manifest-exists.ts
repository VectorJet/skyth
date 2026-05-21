import * as fs from "fs/promises";
import type { LoadHook } from "@/gateway/core/contracts/index.ts";

export const manifestExistsHook: LoadHook = {
	name: "preload.manifest-exists",
	phase: "preload",
	appliesTo: ["tool", "pipeline", "mcp", "agent"],
	async run(candidate) {
		if (!candidate.manifestPath) {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: "manifest.json path is required.",
			};
		}
		try {
			const stat = await fs.stat(candidate.manifestPath);
			if (!stat.isFile()) throw new Error("manifest path is not a file");
			return {
				ok: true,
				hook: this.name,
				phase: this.phase,
				severity: "info",
				message: "Manifest exists.",
			};
		} catch (error: any) {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: `Manifest missing: ${error?.message || error}`,
			};
		}
	},
};
