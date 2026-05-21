import * as fs from "fs/promises";
import * as path from "path";
import type { LoadHook } from "@/gateway/core/contracts/index.ts";
import type { ToolAxMetadata } from "@/gateway/registries/tools/types.ts";

const ARRAY_FIELDS: Array<keyof ToolAxMetadata> = [
	"triggerPhrases",
	"relatedTools",
	"whenNotToUse",
	"commonUses",
	"followUps",
	"intentExamples",
];

function validateAx(ax: unknown): string | null {
	if (ax === undefined) return null;
	if (!ax || typeof ax !== "object" || Array.isArray(ax))
		return "AX metadata must be an object.";
	const typed = ax as ToolAxMetadata;
	if (typed.summary !== undefined && typeof typed.summary !== "string")
		return "AX summary must be a string.";
	if (typed.category !== undefined && typeof typed.category !== "string")
		return "AX category must be a string.";
	if (
		typed.visibility !== undefined &&
		!["always", "suggested", "discoverable", "hidden", "blocked"].includes(
			String(typed.visibility),
		)
	)
		return "AX visibility is invalid.";
	for (const field of ARRAY_FIELDS) {
		const value = typed[field];
		if (
			value !== undefined &&
			(!Array.isArray(value) || value.some((item) => typeof item !== "string"))
		) {
			return `AX ${field} must be an array of strings.`;
		}
	}
	return null;
}

async function readJsonIfExists(
	filePath: string,
): Promise<unknown | undefined> {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8"));
	} catch (error: any) {
		if (error?.code === "ENOENT") return undefined;
		throw error;
	}
}

export const axMetadataHook: LoadHook = {
	name: "ax.metadata",
	phase: "validate",
	appliesTo: ["tool", "pipeline", "skill", "mcp", "agent"],
	async run(candidate) {
		const axSidecars = ["AX.json", "ax.json", ".gateway-ax.json"];
		let ax: unknown = candidate.metadata?.ax;
		if (!ax && candidate.manifestPath) {
			try {
				ax = JSON.parse(await fs.readFile(candidate.manifestPath, "utf8")).ax;
			} catch {}
		}
		if (!ax) {
			for (const sidecar of axSidecars) {
				const loaded = await readJsonIfExists(
					path.join(candidate.root, sidecar),
				);
				if (loaded) {
					ax = loaded;
					break;
				}
			}
		}

		const error = validateAx(ax);
		if (error)
			return {
				ok: false,
				hook: this.name,
				phase: this.phase,
				severity: "error",
				message: error,
			};
		return {
			ok: true,
			hook: this.name,
			phase: this.phase,
			severity: "info",
			message: ax ? "AX metadata passed." : "No AX metadata declared.",
		};
	},
};
