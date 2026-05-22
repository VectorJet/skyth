import type { ToolResult } from "@/base/base_agent/runtime/types";

export const MAX_PROVIDER_ERROR_RECOVERY_ATTEMPTS = 5;
export const RETRY_INITIAL_DELAY_MS = 2_000;
export const RETRY_BACKOFF_FACTOR = 2;
export const RETRY_MAX_DELAY_MS = 30_000;

export function isRateLimitError(content: string | null | undefined): boolean {
	if (!content) return false;
	const lower = content.toLowerCase();
	return (
		lower.includes("rate limit") ||
		lower.includes("rate_limit") ||
		lower.includes("too many requests")
	);
}

export function isProviderErrorContent(
	content: string | null | undefined,
): boolean {
	if (!content) return false;
	return /^provider error:/i.test(content.trim());
}

export function recoveryDelayMs(attempt: number): number {
	return Math.min(
		RETRY_INITIAL_DELAY_MS * RETRY_BACKOFF_FACTOR ** Math.max(0, attempt - 1),
		RETRY_MAX_DELAY_MS,
	);
}

export function toolResultFallback(results: ToolResult[], maxLines = 8): string | null {
	const recent = results.slice(-2).filter((result) => result.content.trim());
	if (!recent.length) return null;
	const sections = [
		"I hit a temporary provider issue while finalizing, but the tool step completed.",
	];
	for (const result of recent) {
		const lines = result.content.trim().split(/\r?\n/g);
		const snippet = lines.slice(0, maxLines).join("\n");
		const suffix = lines.length > maxLines ? "\n..." : "";
		sections.push(`${result.name}:\n${snippet}${suffix}`);
	}
	return sections.join("\n\n");
}

export function degradedModeFallback(messages: Array<Record<string, unknown>>): string {
	const lastUser = [...messages]
		.reverse()
		.find((message) => message.role === "user" && typeof message.content === "string");
	const hint = String(lastUser?.content ?? "").trim();
	if (hint) {
		return `I switched to degraded mode due to upstream instability. I preserved context for: "${hint.slice(0, 180)}".`;
	}
	return "I switched to degraded mode due to upstream instability. I preserved context for the current task.";
}
