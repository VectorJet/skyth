// Re-export all from modular files
export { MergeRouter } from "./merge";

export {
	isExplicitCrossChannelRequest,
	DEFAULT_CACHE_TTL_MS,
	DEFAULT_CACHE_MAX_ENTRIES,
	DEFAULT_MAX_SOURCE_MESSAGES,
	DEFAULT_MAX_TARGET_MESSAGES,
	DEFAULT_MAX_SNIPPET_CHARS,
	CROSS_CHANNEL_EXPLICIT_PATTERNS,
	CONTINUATION_CUE_PATTERN,
	RESET_TOPIC_PATTERN,
	STOP_WORDS,
} from "./patterns";

export {
	classifyWithLLM,
	parseRouterResponse,
	heuristicClassify,
} from "./llm-classifier";

export { generateSessionName, generateSimpleName } from "./session-naming";

export type {
	MergeDecision,
	MergeRouterResult,
	SessionNamingResult,
	MergeRouterOptions,
	CachedRouterResult,
	RouterDeps,
	LlmClassifierDeps,
} from "./types";