import {
	normalizeAxToolDescriptor,
	type AxToolDescriptor,
} from "@/gateway/meta/tools/ax.ts";
import type {
	NegativeToolConstraints,
	ToolMatch,
} from "@/gateway/meta/tools/find/types.ts";
import {
	expandQueryTokens,
	extractNegatedText,
	toLowerSet,
	tokenize,
} from "@/gateway/meta/tools/find/tokens.ts";

function countTokenOverlap(field: string, tokens: string[]): number {
	const fieldTokens = new Set(tokenize(field));
	let hits = 0;
	for (const token of tokens) if (fieldTokens.has(token)) hits++;
	return hits;
}

function addSignal(signals: string[], signal: string): void {
	if (!signals.includes(signal)) signals.push(signal);
}

function includesPhrase(text: string, phrase: string): boolean {
	const normalizedText = text.toLowerCase().replace(/\s+/g, " ");
	const normalizedPhrase = phrase.toLowerCase().replace(/\s+/g, " ").trim();
	return Boolean(normalizedPhrase && normalizedText.includes(normalizedPhrase));
}

function scoreTokenMatches(
	field: string,
	tokens: string[],
	weight: number,
	signals: string[],
	signalLabel: string,
): number {
	const fieldTokens = new Set(tokenize(field));
	let hits = 0;
	for (const token of tokens) if (fieldTokens.has(token)) hits++;
	if (hits > 0) addSignal(signals, `${signalLabel}:${hits}`);
	return hits * weight;
}

function scoreNegatedIntent(
	descriptor: AxToolDescriptor,
	negatedPhrases: string[],
	signals: string[],
): number {
	let penalty = 0;
	for (const phrase of negatedPhrases) {
		const phraseTokens = expandQueryTokens(tokenize(phrase));
		if (phraseTokens.length === 0) continue;
		const highSalience = [
			descriptor.name,
			descriptor.category,
			descriptor.tags.join(" "),
			descriptor.triggerPhrases.join(" "),
			descriptor.intentExamples.join(" "),
		].join(" ");
		const mediumSalience = [
			descriptor.summary,
			descriptor.commonUses.join(" "),
			descriptor.relatedTools.join(" "),
			descriptor.parameterNames.join(" "),
		].join(" ");
		const highHits = countTokenOverlap(highSalience, phraseTokens);
		const mediumHits = countTokenOverlap(mediumSalience, phraseTokens);
		if (
			includesPhrase(highSalience, phrase) ||
			highHits >= Math.min(2, phraseTokens.length)
		) {
			penalty -= 140;
			addSignal(signals, `negated-intent:${phrase}`);
			continue;
		}
		if (
			includesPhrase(mediumSalience, phrase) ||
			mediumHits >= Math.min(2, phraseTokens.length)
		) {
			penalty -= 80;
			addSignal(signals, `negated-related:${phrase}`);
		}
	}
	return penalty;
}

function scoreWhenNotToUse(
	query: string,
	queryTokens: string[],
	descriptor: AxToolDescriptor,
	signals: string[],
): number {
	let penalty = 0;
	const queryTokenSet = new Set(queryTokens);
	for (const negative of descriptor.whenNotToUse) {
		const negativeTokens = tokenize(negative);
		if (negativeTokens.length === 0) continue;
		const exactPhrase = includesPhrase(query, negative);
		const allTokensPresent = negativeTokens.every((token) =>
			queryTokenSet.has(token),
		);
		if (exactPhrase || allTokensPresent) {
			penalty -= 45;
			addSignal(signals, "negative-guidance");
		}
	}
	return penalty;
}

function isToolExplicitlyExcluded(
	descriptor: AxToolDescriptor,
	source: string | undefined,
	constraints: NegativeToolConstraints,
): boolean {
	const excludedTools = toLowerSet(constraints.excludeTools ?? []);
	const excludedCategories = toLowerSet(constraints.excludeCategories ?? []);
	const excludedTags = toLowerSet(constraints.excludeTags ?? []);
	const excludedSources = toLowerSet(constraints.excludeSources ?? []);
	if (excludedTools.has(descriptor.name.toLowerCase())) return true;
	if (excludedTools.has(descriptor.name.replace(/^.*:/, "").toLowerCase()))
		return true;
	if (excludedCategories.has(descriptor.category.toLowerCase())) return true;
	if (source && excludedSources.has(source.toLowerCase())) return true;
	return descriptor.tags.some((tag) => excludedTags.has(tag.toLowerCase()));
}

function scoreTool(
	query: string,
	queryTokens: string[],
	expandedTokens: string[],
	negatedPhrases: string[],
	name: string,
	tool: any,
	constraints: NegativeToolConstraints = {},
): { score: number; descriptor: AxToolDescriptor; signals: string[] } {
	const descriptor = normalizeAxToolDescriptor(name, tool);
	const queryLower = query.toLowerCase().trim();
	const nameLower = name.toLowerCase();
	const signals: string[] = [];
	let score = 0;
	if (isToolExplicitlyExcluded(descriptor, tool.source, constraints))
		return { score: -10_000, descriptor, signals: ["excluded-by-parameter"] };
	if (nameLower === queryLower) {
		score += 160;
		addSignal(signals, "exact-name");
	}
	if (queryLower && nameLower.includes(queryLower)) {
		score += 90;
		addSignal(signals, "name-phrase");
	}
	if (queryLower && descriptor.summary.toLowerCase().includes(queryLower)) {
		score += 70;
		addSignal(signals, "summary-phrase");
	}
	if (queryLower && descriptor.description.toLowerCase().includes(queryLower)) {
		score += 55;
		addSignal(signals, "description-phrase");
	}
	for (const phrase of descriptor.triggerPhrases) {
		if (includesPhrase(query, phrase) || includesPhrase(phrase, query)) {
			score += 90;
			addSignal(signals, "trigger-phrase");
			break;
		}
	}
	for (const phrase of descriptor.intentExamples) {
		if (includesPhrase(phrase, query) || includesPhrase(query, phrase)) {
			score += 65;
			addSignal(signals, "intent-example");
			break;
		}
	}
	score += scoreTokenMatches(name, queryTokens, 26, signals, "name-token");
	score += scoreTokenMatches(
		descriptor.summary,
		queryTokens,
		18,
		signals,
		"summary-token",
	);
	score += scoreTokenMatches(
		descriptor.description,
		queryTokens,
		12,
		signals,
		"description-token",
	);
	score += scoreTokenMatches(
		descriptor.category,
		queryTokens,
		20,
		signals,
		"category-token",
	);
	score += scoreTokenMatches(
		descriptor.tags.join(" "),
		expandedTokens,
		14,
		signals,
		"tag-token",
	);
	score += scoreTokenMatches(
		descriptor.parameterNames.join(" "),
		expandedTokens,
		12,
		signals,
		"param-name",
	);
	score += scoreTokenMatches(
		descriptor.parameterDescriptions.join(" "),
		expandedTokens,
		7,
		signals,
		"param-desc",
	);
	score += scoreTokenMatches(
		descriptor.triggerPhrases.join(" "),
		expandedTokens,
		20,
		signals,
		"trigger-token",
	);
	score += scoreTokenMatches(
		descriptor.commonUses.join(" "),
		expandedTokens,
		14,
		signals,
		"common-use",
	);
	score += scoreTokenMatches(
		descriptor.relatedTools.join(" "),
		expandedTokens,
		8,
		signals,
		"related-tool",
	);
	for (const token of expandedTokens) {
		if (token.length < 3) continue;
		if (nameLower.includes(token)) {
			score += 9;
			addSignal(signals, "name-substring");
		}
		if (descriptor.searchText.toLowerCase().includes(token)) score += 3;
	}
	score += scoreWhenNotToUse(query, queryTokens, descriptor, signals);
	score += scoreNegatedIntent(descriptor, negatedPhrases, signals);
	const hasPositiveSignal = signals.some(
		(signal) =>
			!signal.startsWith("negative-") && !signal.startsWith("negated-"),
	);
	if (hasPositiveSignal && descriptor.visibility === "always") score += 8;
	if (hasPositiveSignal && descriptor.visibility === "suggested") score += 4;
	if (descriptor.visibility === "hidden") score -= 80;
	if (descriptor.visibility === "blocked") score -= 500;
	return { score, descriptor, signals };
}

export function searchTools(
	query: string,
	allTools: Map<string, any>,
	constraints: NegativeToolConstraints = {},
): ToolMatch[] {
	const queryTokens = tokenize(query);
	const expandedTokens = expandQueryTokens(queryTokens);
	const negatedPhrases = [
		...extractNegatedText(query),
		...(constraints.avoid ?? []),
	];
	const matches: ToolMatch[] = [];
	for (const [name, tool] of allTools.entries()) {
		const { score, descriptor, signals } = scoreTool(
			query,
			queryTokens,
			expandedTokens,
			negatedPhrases,
			name,
			tool,
			constraints,
		);
		const hasPositiveSignal = signals.some(
			(signal) =>
				!signal.startsWith("negative-") && !signal.startsWith("negated-"),
		);
		if (score > 0 && hasPositiveSignal) {
			matches.push({
				name,
				description: descriptor.description,
				summary: descriptor.summary,
				score,
				category: descriptor.category,
				visibility: descriptor.visibility,
				tags: descriptor.tags,
				triggerPhrases: descriptor.triggerPhrases.slice(0, 5),
				relatedTools: descriptor.relatedTools.slice(0, 8),
				whenNotToUse: descriptor.whenNotToUse.slice(0, 3),
				matchedSignals: signals,
				parameters: tool.parameters,
				source: tool.source,
			});
		}
	}
	matches.sort((a, b) => b.score - a.score);
	return matches;
}
