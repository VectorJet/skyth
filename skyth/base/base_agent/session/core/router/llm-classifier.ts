import type { LLMProvider } from "@/providers/base";
import type { MergeRouterResult } from "./types";
import {
	STOP_WORDS,
	CONTINUATION_CUE_PATTERN,
	RESET_TOPIC_PATTERN,
} from "./patterns";

export interface LlmClassifierDeps {
	provider?: LLMProvider;
	model?: string;
}

export async function classifyWithLLM(
	provider: LLMProvider | undefined,
	model: string | undefined,
	sourceSummary: string,
	targetSummary: string,
	currentMessage: string,
): Promise<MergeRouterResult> {
	const prompt = [
		"You are a cross-channel context router.",
		"Classify whether the current message should continue context from the source channel session.",
		"",
		"Output must be valid JSON only, with this exact schema:",
		'{"decision":"continue|ambiguous|separate","confidence":0.0,"reason_code":"short_code"}',
		"",
		"Rules:",
		"- continue: user is continuing, recalling, or referencing prior cross-channel conversation",
		"- ambiguous: unclear intent",
		"- separate: clearly unrelated topic",
		"- If current message asks about last/previous message on another channel, choose continue",
		"",
		"Source session snippets:",
		sourceSummary,
		"",
		"Target session snippets:",
		targetSummary,
		"",
		"Current message:",
		currentMessage.slice(0, 300),
	].join("\n");

	if (!provider) {
		return {
			decision: "ambiguous",
			confidence: 0.5,
			reason: "No provider available for LLM routing",
		};
	}

	try {
		const response = await provider.chat({
			messages: [
				{
					role: "system",
					content:
						'Return only minified JSON. No markdown. No prose. Schema: {"decision":"continue|ambiguous|separate","confidence":0.0,"reason_code":"short_code"}.',
				},
				{ role: "user", content: prompt },
			],
			model,
			temperature: 0,
			max_tokens: 120,
		});

		const raw = (response.content ?? "").trim();
		const parsed = parseRouterResponse(raw);
		if (parsed) return parsed;

		if (raw.startsWith("Provider error:")) {
			return heuristicClassify(
				sourceSummary,
				targetSummary,
				currentMessage,
				`LLM router provider error (${raw.slice(0, 120)})`,
			);
		}

		return heuristicClassify(
			sourceSummary,
			targetSummary,
			currentMessage,
			"LLM router output unparseable",
		);
	} catch {
		return heuristicClassify(
			sourceSummary,
			targetSummary,
			currentMessage,
			"LLM router request failed",
		);
	}
}

export function parseRouterResponse(raw: string): MergeRouterResult | null {
	const jsonCandidate = extractJsonObject(raw);
	if (jsonCandidate) {
		try {
			const parsed = JSON.parse(jsonCandidate) as {
				decision?: string;
				confidence?: number;
				reason_code?: string;
			};
			const decision = normalizeDecision(parsed.decision);
			if (decision) {
				const confidenceRaw = Number(parsed.confidence);
				const confidence = Number.isFinite(confidenceRaw)
					? Math.min(1, Math.max(0, confidenceRaw))
					: decision === "continue"
						? 0.85
						: decision === "separate"
							? 0.85
							: 0.5;
				const reason = parsed.reason_code
					? `LLM reason_code: ${parsed.reason_code}`
					: "LLM structured decision";
				return { decision, confidence, reason };
			}
		} catch {
			// Continue to textual fallback.
		}
	}

	const decisionMatch = raw.match(
		/\bdecision\b\s*[:=]\s*["']?(continue|ambiguous|separate)["']?/i,
	);
	if (decisionMatch) {
		const decision = normalizeDecision(decisionMatch[1]);
		if (decision) {
			const confidenceMatch = raw.match(
				/\bconfidence\b\s*[:=]\s*([0-9]*\.?[0-9]+)/i,
			);
			const confidenceRaw = confidenceMatch ? Number(confidenceMatch[1]) : NaN;
			const confidence = Number.isFinite(confidenceRaw)
				? Math.min(1, Math.max(0, confidenceRaw))
				: decision === "ambiguous"
					? 0.5
					: 0.8;
			return {
				decision,
				confidence,
				reason: "LLM textual key-value decision",
			};
		}
	}

	const upper = raw.toUpperCase();
	if (upper.includes("CONTINUE")) {
		return {
			decision: "continue",
			confidence: 0.8,
			reason: "LLM textual decision: continue",
		};
	}
	if (upper.includes("SEPARATE")) {
		return {
			decision: "separate",
			confidence: 0.8,
			reason: "LLM textual decision: separate",
		};
	}
	if (upper.includes("AMBIGUOUS")) {
		return {
			decision: "ambiguous",
			confidence: 0.5,
			reason: "LLM textual decision: ambiguous",
		};
	}

	return null;
}

function extractJsonObject(text: string): string | null {
	for (let start = 0; start < text.length; start += 1) {
		if (text[start] !== "{") continue;
		let depth = 0;
		let inString = false;
		let escaped = false;
		for (let index = start; index < text.length; index += 1) {
			const ch = text[index]!;
			if (inString) {
				if (escaped) {
					escaped = false;
					continue;
				}
				if (ch === "\\") {
					escaped = true;
					continue;
				}
				if (ch === '"') {
					inString = false;
				}
				continue;
			}
			if (ch === '"') {
				inString = true;
				continue;
			}
			if (ch === "{") depth += 1;
			if (ch === "}") {
				depth -= 1;
				if (depth === 0) {
					return text.slice(start, index + 1);
				}
			}
		}
	}
	return null;
}

function normalizeDecision(
	value?: string,
): "continue" | "ambiguous" | "separate" | null {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	if (normalized === "continue") return "continue";
	if (normalized === "ambiguous") return "ambiguous";
	if (normalized === "separate") return "separate";
	return null;
}

function tokenize(text: string): Set<string> {
	const normalized = text
		.toLowerCase()
		.replace(/\[[^\]]*\]/g, " ")
		.replace(/[^a-z0-9\s]/g, " ");
	const tokens = normalized
		.split(/\s+/)
		.map((t) => t.trim())
		.filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
	return new Set(tokens);
}

function overlapScore(a: string, b: string): number {
	const aTokens = tokenize(a);
	const bTokens = tokenize(b);
	if (!aTokens.size || !bTokens.size) return 0;
	let overlap = 0;
	for (const token of aTokens) {
		if (bTokens.has(token)) overlap += 1;
	}
	return overlap / aTokens.size;
}

export function heuristicClassify(
	sourceSummary: string,
	targetSummary: string,
	currentMessage: string,
	baseReason: string,
): MergeRouterResult {
	const current = currentMessage.trim();
	const currentLower = current.toLowerCase();
	if (!current) {
		return {
			decision: "ambiguous",
			confidence: 0.4,
			reason: `${baseReason}; heuristic: empty message`,
		};
	}

	if (RESET_TOPIC_PATTERN.test(currentLower)) {
		return {
			decision: "separate",
			confidence: 0.9,
			reason: `${baseReason}; heuristic: explicit topic reset`,
		};
	}

	const sourceEmpty = sourceSummary === "(empty)";
	const targetEmpty = targetSummary === "(empty)";
	const sourceScore = overlapScore(current, sourceSummary);
	const targetScore = overlapScore(current, targetSummary);
	const continuationCue = CONTINUATION_CUE_PATTERN.test(currentLower);
	const currentTokenCount = tokenize(current).size;

	if (!sourceEmpty && targetEmpty) {
		if (sourceScore >= 0.16 || (continuationCue && currentTokenCount <= 8)) {
			return {
				decision: "continue",
				confidence: 0.72,
				reason: `${baseReason}; heuristic: source context carryover`,
			};
		}
	}

	if (
		!sourceEmpty &&
		sourceScore >= targetScore + 0.12 &&
		sourceScore >= 0.18
	) {
		return {
			decision: "continue",
			confidence: 0.7,
			reason: `${baseReason}; heuristic: source overlap`,
		};
	}

	if (!targetEmpty && targetScore >= sourceScore + 0.12 && targetScore >= 0.2) {
		return {
			decision: "separate",
			confidence: 0.68,
			reason: `${baseReason}; heuristic: target overlap`,
		};
	}

	return {
		decision: "ambiguous",
		confidence: 0.5,
		reason: `${baseReason}; heuristic: low signal`,
	};
}
