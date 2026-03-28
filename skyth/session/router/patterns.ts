export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_CACHE_MAX_ENTRIES = 256;
export const DEFAULT_MAX_SOURCE_MESSAGES = 5;
export const DEFAULT_MAX_TARGET_MESSAGES = 3;
export const DEFAULT_MAX_SNIPPET_CHARS = 220;

export const CROSS_CHANNEL_EXPLICIT_PATTERNS: RegExp[] = [
	/\b(last|latest|previous)\s+(message|msg)\b/i,
	/\bwhat\s+was\s+my\s+last\b/i,
	/\bbefore\s+the\s+switch\b/i,
	/\bfrom\s+(telegram|discord|slack|whatsapp|email|cli)\b/i,
	/\bon\s+(telegram|discord|slack|whatsapp|email|cli)\b/i,
	/\bacross\s+channels?\b/i,
	/\bother\s+channel\b/i,
	/\bcontinue\s+from\b/i,
];

export const CONTINUATION_CUE_PATTERN =
	/\b(also|and|still|same|again|anyway|right|that|it|this)\b/i;
export const RESET_TOPIC_PATTERN =
	/\b(new topic|different topic|start over|start fresh|unrelated)\b/i;

export const STOP_WORDS = new Set([
	"the", "and", "for", "with", "that", "this", "from", "what", "when",
	"where", "which", "your", "you", "have", "has", "was", "were", "are",
	"but", "not", "about", "just", "like", "into", "onto", "than", "then",
	"they", "them", "their", "there", "here", "would", "could", "should",
	"will", "shall", "been", "being", "them", "ours", "ourselves", "myself",
	"yourself", "ours", "yours", "mine", "ours", "some", "any", "all", "can",
	"did", "does", "doing", "done", "too", "very", "really", "much", "more",
	"most", "only", "need",
]);

export function isExplicitCrossChannelRequest(
	message: string,
	sourceChannel?: string,
): boolean {
	const text = message.trim();
	if (!text) return false;
	if (CROSS_CHANNEL_EXPLICIT_PATTERNS.some((pattern) => pattern.test(text)))
		return true;
	if (sourceChannel) {
		const escaped = sourceChannel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const sourcePattern = new RegExp(`\\b${escaped}\\b`, "i");
		if (sourcePattern.test(text)) return true;
	}
	return false;
}