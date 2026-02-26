import type { LLMProvider } from "../providers/base";
import type { SessionMessage } from "./manager";
import { createHash } from "node:crypto";

export type MergeDecision = "continue" | "ambiguous" | "separate";

export interface MergeRouterResult {
  decision: MergeDecision;
  confidence: number;
  reason: string;
}

interface MergeRouterOptions {
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  maxSourceMessages?: number;
  maxTargetMessages?: number;
  maxSnippetChars?: number;
}

type CachedRouterResult = {
  result: MergeRouterResult;
  expiresAt: number;
};

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_CACHE_MAX_ENTRIES = 256;
const DEFAULT_MAX_SOURCE_MESSAGES = 3;
const DEFAULT_MAX_TARGET_MESSAGES = 2;
const DEFAULT_MAX_SNIPPET_CHARS = 180;

const CROSS_CHANNEL_EXPLICIT_PATTERNS: RegExp[] = [
  /\b(last|latest|previous)\s+(message|msg)\b/i,
  /\bwhat\s+was\s+my\s+last\b/i,
  /\bbefore\s+the\s+switch\b/i,
  /\bfrom\s+(telegram|discord|slack|whatsapp|email|cli)\b/i,
  /\bon\s+(telegram|discord|slack|whatsapp|email|cli)\b/i,
  /\bacross\s+channels?\b/i,
  /\bother\s+channel\b/i,
  /\bcontinue\s+from\b/i,
];

export function isExplicitCrossChannelRequest(message: string, sourceChannel?: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (CROSS_CHANNEL_EXPLICIT_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (sourceChannel) {
    const escaped = sourceChannel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sourcePattern = new RegExp(`\\b${escaped}\\b`, "i");
    if (sourcePattern.test(text)) return true;
  }
  return false;
}

export class MergeRouter {
  private readonly cache = new Map<string, CachedRouterResult>();
  private readonly cacheTtlMs: number;
  private readonly cacheMaxEntries: number;
  private readonly maxSourceMessages: number;
  private readonly maxTargetMessages: number;
  private readonly maxSnippetChars: number;

  constructor(private provider?: LLMProvider, private model?: string, options: MergeRouterOptions = {}) {
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.cacheMaxEntries = options.cacheMaxEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
    this.maxSourceMessages = options.maxSourceMessages ?? DEFAULT_MAX_SOURCE_MESSAGES;
    this.maxTargetMessages = options.maxTargetMessages ?? DEFAULT_MAX_TARGET_MESSAGES;
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

    const sourceText = this.compactMessages(sourceMessages, this.maxSourceMessages);
    const targetText = this.compactMessages(targetMessages, this.maxTargetMessages);
    const cacheKey = this.buildCacheKey(sourceText, targetText, currentMessage);
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const result = await this.classifyWithLLM(sourceText, targetText, currentMessage);
    this.setCached(cacheKey, result);
    return result;
  }

  private compactMessages(messages: SessionMessage[], maxMessages: number): string {
    const filtered = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-Math.max(1, maxMessages));

    if (!filtered.length) return "(empty)";

    return filtered
      .map((m) => {
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
        const normalized = content.replace(/\s+/g, " ").trim().slice(0, this.maxSnippetChars);
        return `[${m.role}] ${normalized}`;
      })
      .join("\n");
  }

  private buildCacheKey(sourceText: string, targetText: string, currentMessage: string): string {
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

  private async classifyWithLLM(
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

    if (this.provider) {
      try {
        const response = await this.provider.chat({
          messages: [{ role: "user", content: prompt }],
          model: this.model,
          temperature: 0,
          max_tokens: 80,
        });

        const raw = (response.content ?? "").trim();
        const parsed = this.parseRouterResponse(raw);
        if (parsed) return parsed;
        return {
          decision: "ambiguous",
          confidence: 0.45,
          reason: "LLM router output unparseable",
        };
      } catch {
        return {
          decision: "ambiguous",
          confidence: 0.4,
          reason: "LLM router request failed",
        };
      }
    }
    return { decision: "ambiguous", confidence: 0.5, reason: "No provider available for LLM routing" };
  }

  private parseRouterResponse(raw: string): MergeRouterResult | null {
    const jsonCandidate = this.extractJsonObject(raw);
    if (jsonCandidate) {
      try {
        const parsed = JSON.parse(jsonCandidate) as {
          decision?: string;
          confidence?: number;
          reason_code?: string;
        };
        const decision = this.normalizeDecision(parsed.decision);
        if (decision) {
          const confidenceRaw = Number(parsed.confidence);
          const confidence = Number.isFinite(confidenceRaw)
            ? Math.min(1, Math.max(0, confidenceRaw))
            : (decision === "continue" ? 0.85 : decision === "separate" ? 0.85 : 0.5);
          const reason = parsed.reason_code ? `LLM reason_code: ${parsed.reason_code}` : "LLM structured decision";
          return { decision, confidence, reason };
        }
      } catch {
        // Continue to textual fallback.
      }
    }

    const upper = raw.toUpperCase();
    if (upper.includes("CONTINUE")) {
      return { decision: "continue", confidence: 0.8, reason: "LLM textual decision: continue" };
    }
    if (upper.includes("SEPARATE")) {
      return { decision: "separate", confidence: 0.8, reason: "LLM textual decision: separate" };
    }
    if (upper.includes("AMBIGUOUS")) {
      return { decision: "ambiguous", confidence: 0.5, reason: "LLM textual decision: ambiguous" };
    }

    return null;
  }

  private extractJsonObject(text: string): string | null {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
  }

  private normalizeDecision(value?: string): MergeDecision | null {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (normalized === "continue") return "continue";
    if (normalized === "ambiguous") return "ambiguous";
    if (normalized === "separate") return "separate";
    return null;
  }
}
