import type { PiTextCompletionClient } from "@/pi/completion";
import type { SessionMessage } from "@/base/base_agent/session/core/manager";

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
	provider?: PiTextCompletionClient;
	model?: string;
}

export interface LlmClassifierDeps {
	provider?: PiTextCompletionClient;
	model?: string;
}
