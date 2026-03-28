import type { LLMProvider } from "@/providers/base";
import type { SessionMessage } from "@/session/manager";

export type MergeDecision = "continue" | "ambiguous" | "separate";

export interface MergeRouterResult {
	decision: MergeDecision;
	confidence: number;
	reason: string;
}

export interface SessionNamingResult {
	name: string;
	confidence: number;
}

export interface MergeRouterOptions {
	cacheTtlMs?: number;
	cacheMaxEntries?: number;
	maxSourceMessages?: number;
	maxTargetMessages?: number;
	maxSnippetChars?: number;
}

export interface CachedRouterResult {
	result: MergeRouterResult;
	expiresAt: number;
}

export interface RouterDeps {
	provider?: LLMProvider;
	model?: string;
}

export interface LlmClassifierDeps {
	provider?: LLMProvider;
	model?: string;
}