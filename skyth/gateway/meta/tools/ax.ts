import type { ToolVisibility } from "@/gateway/registries/tools/types.ts";

export interface AxToolLike {
	description?: string;
	parameters?: any[];
	metadata?: Record<string, any>;
	examples?: any[];
	source?: string;
}

export interface AxToolDescriptor {
	name: string;
	description: string;
	summary: string;
	category: string;
	tags: string[];
	visibility: ToolVisibility;
	triggerPhrases: string[];
	relatedTools: string[];
	whenNotToUse: string[];
	commonUses: string[];
	followUps: string[];
	intentExamples: string[];
	parameterNames: string[];
	parameterDescriptions: string[];
	searchText: string;
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((item) => String(item).trim()).filter(Boolean);
}

function firstSentence(text: string): string {
	const compact = text.replace(/\s+/g, " ").trim();
	if (!compact) return "";
	const sentence = compact.match(/^(.{1,180}?[.!?])(?:\s|$)/)?.[1];
	return (sentence || compact.slice(0, 180)).trim();
}

function validVisibility(value: unknown): ToolVisibility {
	const raw = String(value ?? "").trim();
	if (
		raw === "always" ||
		raw === "suggested" ||
		raw === "discoverable" ||
		raw === "hidden" ||
		raw === "blocked"
	) {
		return raw;
	}
	return "discoverable";
}

function unique(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const value of values) {
		const normalized = value.trim();
		const key = normalized.toLowerCase();
		if (!normalized || seen.has(key)) continue;
		seen.add(key);
		out.push(normalized);
	}
	return out;
}

export function normalizeAxToolDescriptor(
	name: string,
	tool: AxToolLike,
): AxToolDescriptor {
	const metadata = tool.metadata ?? {};
	const ax = metadata.ax && typeof metadata.ax === "object" ? metadata.ax : {};
	const description = String(tool.description ?? "");
	const summary = String(
		ax.summary ?? metadata.summary ?? firstSentence(description) ?? name,
	).trim();
	const category =
		String(ax.category ?? metadata.category ?? "general").trim() || "general";
	const tags = unique(asStringArray(metadata.tags));
	const parameters = Array.isArray(tool.parameters) ? tool.parameters : [];
	const parameterNames = unique(
		parameters.map((param) => String(param?.name ?? "")),
	);
	const parameterDescriptions = unique(
		parameters.map((param) => String(param?.description ?? "")),
	);
	const examples = Array.isArray(tool.examples) ? tool.examples : [];
	const exampleText = examples.flatMap((example) => [
		String(example?.description ?? ""),
		JSON.stringify(example?.arguments ?? {}),
	]);

	const triggerPhrases = unique([
		...asStringArray(ax.triggerPhrases),
		...asStringArray(metadata.triggerPhrases),
		...asStringArray(ax.intentExamples),
		...asStringArray(metadata.intentExamples),
	]);
	const relatedTools = unique([
		...asStringArray(ax.relatedTools),
		...asStringArray(metadata.relatedTools),
	]);
	const whenNotToUse = unique([
		...asStringArray(ax.whenNotToUse),
		...asStringArray(metadata.whenNotToUse),
	]);
	const commonUses = unique([
		...asStringArray(ax.commonUses),
		...asStringArray(metadata.commonUses),
	]);
	const followUps = unique([
		...asStringArray(ax.followUps),
		...asStringArray(metadata.followUps),
	]);
	const intentExamples = unique([
		...asStringArray(ax.intentExamples),
		...asStringArray(metadata.intentExamples),
	]);
	const visibility = validVisibility(ax.visibility ?? metadata.visibility);

	const searchText = [
		name,
		description,
		summary,
		category,
		...tags,
		...triggerPhrases,
		...relatedTools,
		...commonUses,
		...followUps,
		...intentExamples,
		...parameterNames,
		...parameterDescriptions,
		...exampleText,
	].join(" ");

	return {
		name,
		description,
		summary,
		category,
		tags,
		visibility,
		triggerPhrases,
		relatedTools,
		whenNotToUse,
		commonUses,
		followUps,
		intentExamples,
		parameterNames,
		parameterDescriptions,
		searchText,
	};
}
