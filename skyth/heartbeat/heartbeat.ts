export const HEARTBEAT_TOKEN = "HEARTBEAT_OK";

export const DEFAULT_HEARTBEAT_PROMPT =
	"Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.";

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;
export const DEFAULT_HEARTBEAT_ACK_MAX_CHARS = 300;

export function isHeartbeatContentEffectivelyEmpty(
	content: string | undefined | null,
): boolean {
	if (content === undefined || content === null) {
		return false;
	}
	if (typeof content !== "string") {
		return false;
	}

	const lines = content.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		if (/^#+(\s|$)/.test(trimmed)) {
			continue;
		}
		if (/^[-*+]\s*(\[[\sXx]?\]\s*)?$/.test(trimmed)) {
			continue;
		}
		return false;
	}
	return true;
}

export function resolveHeartbeatPrompt(raw?: string): string {
	const trimmed = typeof raw === "string" ? raw.trim() : "";
	return trimmed || DEFAULT_HEARTBEAT_PROMPT;
}

export type StripHeartbeatMode = "heartbeat" | "message";

function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTokenAtEdges(raw: string): { text: string; didStrip: boolean } {
	let text = raw.trim();
	if (!text) {
		return { text: "", didStrip: false };
	}

	const token = HEARTBEAT_TOKEN;
	const tokenAtEndWithOptionalTrailingPunctuation = new RegExp(
		`${escapeRegExp(token)}[^\\w]{0,4}$`,
	);
	if (!text.includes(token)) {
		return { text, didStrip: false };
	}

	let didStrip = false;
	let changed = true;
	while (changed) {
		changed = false;
		const next = text.trim();
		if (next.startsWith(token)) {
			const after = next.slice(token.length).trimStart();
			text = after;
			didStrip = true;
			changed = true;
			continue;
		}
		if (tokenAtEndWithOptionalTrailingPunctuation.test(next)) {
			const idx = next.lastIndexOf(token);
			const before = next.slice(0, idx).trimEnd();
			if (!before) {
				text = "";
			} else {
				const after = next.slice(idx + token.length).trimStart();
				text = `${before}${after}`.trimEnd();
			}
			didStrip = true;
			changed = true;
		}
	}

	const collapsed = text.replace(/\s+/g, " ").trim();
	return { text: collapsed, didStrip: didStrip };
}

export function stripHeartbeatToken(
	raw?: string,
	opts: { mode?: StripHeartbeatMode; maxAckChars?: number } = {},
) {
	if (!raw) {
		return { shouldSkip: true, text: "", didStrip: false };
	}
	const trimmed = raw.trim();
	if (!trimmed) {
		return { shouldSkip: true, text: "", didStrip: false };
	}

	const mode: StripHeartbeatMode = opts.mode ?? "message";
	const maxAckCharsRaw = opts.maxAckChars;
	const parsedAckChars =
		typeof maxAckCharsRaw === "string"
			? Number(maxAckCharsRaw)
			: maxAckCharsRaw;
	const maxAckChars = Math.max(
		0,
		typeof parsedAckChars === "number" && Number.isFinite(parsedAckChars)
			? parsedAckChars
			: DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
	);

	const stripMarkup = (text: string) =>
		text
			.replace(/<[^>]*>/g, " ")
			.replace(/&nbsp;/gi, " ")
			.replace(/^[*`~_]+/, "")
			.replace(/[*`~_]+$/, "");

	const trimmedNormalized = stripMarkup(trimmed);
	const hasToken =
		trimmed.includes(HEARTBEAT_TOKEN) ||
		trimmedNormalized.includes(HEARTBEAT_TOKEN);
	if (!hasToken) {
		return { shouldSkip: false, text: trimmed, didStrip: false };
	}

	const strippedOriginal = stripTokenAtEdges(trimmed);
	const strippedNormalized = stripTokenAtEdges(trimmedNormalized);
	const picked =
		strippedOriginal.didStrip && strippedOriginal.text
			? strippedOriginal
			: strippedNormalized;
	if (!picked.didStrip) {
		return { shouldSkip: false, text: trimmed, didStrip: false };
	}

	if (!picked.text) {
		return { shouldSkip: true, text: "", didStrip: true };
	}

	const rest = picked.text.trim();
	if (mode === "heartbeat") {
		if (rest.length <= maxAckChars) {
			return { shouldSkip: true, text: "", didStrip: true };
		}
	}

	return { shouldSkip: false, text: rest, didStrip: true };
}
