import * as fs from "fs/promises";
import * as path from "path";
import type {
	CapabilityManifest,
	LoadCandidate,
	LoadHook,
} from "@/gateway/core/contracts/index.ts";

const SCANNED_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".cjs", ".py"]);

async function readManifest(
	candidate: LoadCandidate,
): Promise<CapabilityManifest> {
	if (!candidate.manifestPath) return { name: candidate.name, description: "" };
	try {
		return JSON.parse(await fs.readFile(candidate.manifestPath, "utf8"));
	} catch {
		return { name: candidate.name, description: "" };
	}
}

async function collectSource(candidate: LoadCandidate): Promise<string> {
	const files = new Set<string>();
	if (candidate.entryPath) files.add(candidate.entryPath);
	for (const rel of candidate.files) {
		const full = path.join(candidate.root, rel);
		if (SCANNED_EXTENSIONS.has(path.extname(full))) files.add(full);
	}
	const chunks: string[] = [];
	for (const file of files) {
		try {
			chunks.push(await fs.readFile(file, "utf8"));
		} catch {}
	}
	return chunks.join("\n");
}

function hasPermission(manifest: CapabilityManifest, prefix: string): boolean {
	return (manifest.permissions || []).some(
		(permission) =>
			permission === prefix || permission.startsWith(`${prefix}:`),
	);
}

export const permissionSecurityHook: LoadHook = {
	name: "security.permissions",
	phase: "security",
	appliesTo: ["tool", "pipeline", "mcp", "agent"],
	async run(candidate) {
		if (candidate.source.trustLevel === "trusted") {
			return {
				ok: true,
				hook: this.name,
				phase: this.phase,
				severity: "info",
				message: "Trusted source security scan skipped.",
			};
		}

		const manifest = await readManifest(candidate);
		const source = await collectSource(candidate);
		const violations: string[] = [];

		if (
			/\bprocess\.env\b|os\.environ|Deno\.env/.test(source) &&
			!hasPermission(manifest, "env")
		) {
			violations.push("env access requires an env permission declaration");
		}
		if (
			/\b(fetch|WebSocket|EventSource)\s*\(|\bhttps?:\/\//.test(source) &&
			!hasPermission(manifest, "network")
		) {
			violations.push(
				"network access requires a network permission declaration",
			);
		}
		if (
			/\b(child_process|spawn|execFile|execSync|subprocess|os\.system)\b/.test(
				source,
			) &&
			!hasPermission(manifest, "process")
		) {
			violations.push(
				"process execution requires a process permission declaration",
			);
		}
		if (
			/\b(fs|fs\/promises|Bun\.file|open\s*\(|Path\()\b/.test(source) &&
			!hasPermission(manifest, "fs")
		) {
			violations.push(
				"filesystem access requires an fs permission declaration",
			);
		}
		if (
			/\b(eval|Function\s*\(|vm\.runIn|__import__\s*\(|importlib)/.test(source)
		) {
			violations.push(
				"dynamic code loading is not allowed for local/generated capabilities",
			);
		}

		if (violations.length > 0) {
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: violations.join("; "),
			};
		}
		return {
			ok: true,
			hook: this.name,
			phase: this.phase,
			severity: "info",
			message: "Security permissions passed.",
		};
	},
};
