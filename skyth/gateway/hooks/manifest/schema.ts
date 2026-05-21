import * as fs from "fs/promises";
import type {
	CapabilityManifest,
	LoadHook,
} from "@/gateway/core/contracts/index.ts";

const VALID_PERMISSION_RE = /^(fs|env|network|process)(:[a-zA-Z0-9_./*-]+)?$/;

export const manifestSchemaHook: LoadHook = {
	name: "manifest.schema",
	phase: "validate",
	appliesTo: ["tool", "pipeline", "skill", "mcp", "agent"],
	async run(candidate) {
		if (!candidate.manifestPath) {
			if (candidate.kind === "skill") {
				return {
					ok: true,
					hook: this.name,
					phase: this.phase,
					severity: "info",
					message: "Skill frontmatter acts as manifest.",
				};
			}
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: "manifest.json is required.",
			};
		}

		let manifest: CapabilityManifest;
		try {
			manifest = JSON.parse(await fs.readFile(candidate.manifestPath, "utf8"));
		} catch (error: any) {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: `Manifest is not valid JSON: ${error?.message || error}`,
			};
		}

		if (!manifest.name || typeof manifest.name !== "string") {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: "Manifest name must be a string.",
			};
		}
		if (!manifest.description || typeof manifest.description !== "string") {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: "Manifest description must be a string.",
			};
		}
		if (manifest.kind && manifest.kind !== candidate.kind) {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: `Manifest kind ${manifest.kind} does not match candidate kind ${candidate.kind}.`,
			};
		}
		if (
			manifest.permissions &&
			(!Array.isArray(manifest.permissions) ||
				manifest.permissions.some(
					(permission) =>
						typeof permission !== "string" ||
						!VALID_PERMISSION_RE.test(permission),
				))
		) {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message:
					"Manifest permissions must be strings like fs:workspace, env:NAME, network, or process:spawn.",
			};
		}

		return {
			ok: true,
			hook: this.name,
			phase: this.phase,
			severity: "info",
			message: "Manifest schema passed.",
		};
	},
};
