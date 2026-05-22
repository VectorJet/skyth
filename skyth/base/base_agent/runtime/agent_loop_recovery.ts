export const MAX_PROVIDER_ERROR_RECOVERY_ATTEMPTS = 5;
export const TOOL_FALLBACK_LINES = 8;
export const RETRY_INITIAL_DELAY = 2000;
export const RETRY_BACKOFF_FACTOR = 2;
export const RETRY_MAX_DELAY = 30000;

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) =>
		setTimeout(resolve, Math.min(ms, RETRY_MAX_DELAY)),
	);
}

export function isRateLimitError(content: string | null): boolean {
	if (!content) return false;
	const lower = content.toLowerCase();
	return (
		lower.includes("rate limit") ||
		lower.includes("rate_limit") ||
		lower.includes("too many requests")
	);
}

export function isProviderErrorContent(content: string | null): boolean {
	if (!content) return false;
	return /^provider error:/i.test(content.trim());
}

export function formatToolFallback(
	messages: Array<Record<string, any>>,
): string | null {
	const recentToolMessages = messages
		.filter((msg) => msg.role === "tool")
		.slice(-2);
	if (!recentToolMessages.length) return null;

	const sections: string[] = [
		"I hit a temporary provider issue while finalizing, but the tool step completed.",
	];

	for (const msg of recentToolMessages) {
		const name = String(msg.name ?? "tool");
		const raw = String(msg.content ?? "").trim();
		if (!raw) continue;
		const lines = raw.split(/\r?\n/);
		const snippet = lines.slice(0, TOOL_FALLBACK_LINES).join("\n").trim();
		const truncated = lines.length > TOOL_FALLBACK_LINES ? "\n..." : "";
		sections.push(`${name}:\n${snippet}${truncated}`);
	}

	return sections.length > 1 ? sections.join("\n\n") : null;
}

export function degradedModeFallback(
	messages: Array<Record<string, any>>,
): string {
	const lastUser = [...messages]
		.reverse()
		.find((msg) => msg.role === "user" && typeof msg.content === "string");
	const taskHint = String(lastUser?.content ?? "").trim();
	if (taskHint) {
		return `I switched to degraded mode due to upstream instability. I preserved context for: "${taskHint.slice(0, 180)}" and will continue automatically as soon as the provider recovers.`;
	}
	return "I switched to degraded mode due to upstream instability. I preserved context and will continue automatically as soon as the provider recovers.";
}
