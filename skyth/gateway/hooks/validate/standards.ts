import * as fs from "fs/promises";
import type { LoadHook } from "@/gateway/core/contracts/index.ts";

export const standardsHook: LoadHook = {
	name: "standards.basic",
	phase: "validate",
	appliesTo: ["tool", "pipeline", "skill", "mcp", "agent"],
	async run(candidate) {
		if (
			!candidate.name ||
			!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,120}$/.test(candidate.name)
		) {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: "Invalid capability name.",
			};
		}
		if (!candidate.root) {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: "Candidate root is required.",
			};
		}
		if (candidate.manifestPath) {
			try {
				const raw = await fs.readFile(candidate.manifestPath, "utf8");
				const manifest = JSON.parse(raw);
				if (!manifest || typeof manifest !== "object") {
					return {
						ok: false,
						hook: this.name,
						phase: this.phase,
						severity: "error",
						message: "Manifest must be an object.",
					};
				}
				if (
					typeof manifest.name !== "string" ||
					typeof manifest.description !== "string"
				) {
					return {
						ok: false,
						hook: this.name,
						phase: this.phase,
						severity: "error",
						message: "Manifest requires string name and description.",
					};
				}
			} catch (error: any) {
				return {
					ok: false,
					hook: this.name,
					phase: this.phase,
					severity: "error",
					message: `Manifest is not readable JSON: ${error?.message || error}`,
				};
			}
		}
		if (candidate.entryPath) {
			try {
				await fs.access(candidate.entryPath);
			} catch {
				return {
					ok: false,
					hook: this.name,
					phase: this.phase,
					severity: "error",
					message: `Entrypoint does not exist: ${candidate.entryPath}`,
				};
			}
		}
		return {
			ok: true,
			hook: this.name,
			phase: this.phase,
			severity: "info",
			message: "Basic standards passed.",
		};
	},
};
