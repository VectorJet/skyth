import { createHash } from "node:crypto";
import type { LLMProvider } from "@/providers/base";
import type { SessionMessage } from "@/session/manager";
import type {
	MergeRouterOptions,
	CachedRouterResult,
	MergeRouterResult,
	SessionNamingResult,
} from "./types";
import {
	isExplicitCrossChannelRequest,
	DEFAULT_CACHE_TTL_MS,
	DEFAULT_CACHE_MAX_ENTRIES,
	DEFAULT_MAX_SOURCE_MESSAGES,
	DEFAULT_MAX_TARGET_MESSAGES,
	DEFAULT_MAX_SNIPPET_CHARS,
} from "./patterns";
import {
	classifyWithLLM,
	heuristicClassify,
} from "./llm-classifier";
import { generateSessionName } from "./session-naming";

export class MergeRouter {
	private readonly cache = new Map<string, CachedRouterResult>();
	private readonly cacheTtlMs: number;
	private readonly cacheMaxEntries: number;
	private readonly maxSourceMessages: number;
	private readonly maxTargetMessages: number;
	private readonly maxSnippetChars: number;

	constructor(
		private provider?: LLMProvider,
		private model?: string,
		options: MergeRouterOptions = {},
	) {
		this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
		this.cacheMaxEntries = options.cacheMaxEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
		this.maxSourceMessages =
			options.maxSourceMessages ?? DEFAULT_MAX_SOURCE_MESSAGES;
		this.maxTargetMessages =
			options.maxTargetMessages ?? DEFAULT_MAX_TARGET_MESSAGES;
		this.maxSnippetChars = options.maxSnippetChars ?? DEFAULT_MAX_SNIPPET_CHARS;
	}

	async classify(
		sourceMessages: SessionMessage[],
		targetMessages: SessionMessage[],
		currentMessage: string,
	): Promise<MergeRouterResult> {
		if (isExplicitCrossChannelRequest(currentMessage)) {
			return {
				decision: "continue",
				confidence: 0.98,
				reason: "Explicit cross-channel reference in user message",
			};
		}

		if (!this.provider) {
			return {
				decision: "ambiguous",
				confidence: 0.5,
				reason: "No provider available for LLM routing",
			};
		}

		const sourceText = this.compactMessages(
			sourceMessages,
			this.maxSourceMessages,
		);
		const targetText = this.compactMessages(
			targetMessages,
			this.maxTargetMessages,
		);
		const cacheKey = this.buildCacheKey(sourceText, targetText, currentMessage);
		const cached = this.getCached(cacheKey);
		if (cached) return cached;

		const result = await classifyWithLLM(
			this.provider,
			this.model,
			sourceText,
			targetText,
			currentMessage,
		);
		this.setCached(cacheKey, result);
		return result;
	}

	private compactMessages(
		messages: SessionMessage[],
		maxMessages: number,
	): string {
		const filtered = messages
			.filter((m) => m.role === "user" || m.role === "assistant")
			.slice(-Math.max(1, maxMessages));

		if (!filtered.length) return "(empty)";

		return filtered
			.map((m) => {
				const content =
					typeof m.content === "string"
						? m.content
						: JSON.stringify(m.content ?? "");
				const normalized = content
					.replace(/\s+/g, " ")
					.trim()
					.slice(0, this.maxSnippetChars);
				return `[${m.role}] ${normalized}`;
			})
			.join("\n");
	}

	private buildCacheKey(
		sourceText: string,
		targetText: string,
		currentMessage: string,
	): string {
		const payload = `${sourceText}\n---\n${targetText}\n---\n${currentMessage.trim().slice(0, 500)}`;
		return createHash("sha256").update(payload).digest("hex");
	}

	private getCached(key: string): MergeRouterResult | null {
		const cached = this.cache.get(key);
		if (!cached) return null;
		if (cached.expiresAt <= Date.now()) {
			this.cache.delete(key);
			return null;
		}
		return cached.result;
	}

	private setCached(key: string, result: MergeRouterResult): void {
		this.cache.set(key, { result, expiresAt: Date.now() + this.cacheTtlMs });
		while (this.cache.size > this.cacheMaxEntries) {
			const first = this.cache.keys().next().value;
			if (!first) break;
			this.cache.delete(first);
		}
	}

	async generateSessionName(
		messages: SessionMessage[],
	): Promise<SessionNamingResult> {
		return generateSessionName(this.provider, this.model, messages);
	}
}

export { heuristicClassify } from "./llm-classifier";
export { generateSessionName, generateSimpleName } from "./session-naming";