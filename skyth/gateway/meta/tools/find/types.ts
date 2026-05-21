export interface ToolMatch {
	name: string;
	description: string;
	summary: string;
	score: number;
	category?: string;
	visibility?: string;
	tags?: string[];
	triggerPhrases?: string[];
	relatedTools?: string[];
	whenNotToUse?: string[];
	matchedSignals?: string[];
	parameters: any[];
	source: string;
}

export interface NegativeToolConstraints {
	avoid?: string[];
	excludeTools?: string[];
	excludeCategories?: string[];
	excludeTags?: string[];
	excludeSources?: string[];
}

export function toStringArray(value: unknown): string[] {
	if (value == null) return [];
	if (Array.isArray(value))
		return value.map((item) => String(item).trim()).filter(Boolean);
	return [String(value).trim()].filter(Boolean);
}
