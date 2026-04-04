import { randomBytes } from "node:crypto";

const EXTERNAL_CONTENT_PREFIX = "<<<EXTERNAL_UNTRUSTED_CONTENT";
const EXTERNAL_CONTENT_SUFFIX = ">>>";
const END_EXTERNAL_CONTENT_PREFIX = "<<<END_EXTERNAL_UNTRUSTED_CONTENT";

function generateId(): string {
	// 🛡️ Sentinel: Use cryptographically secure random number generator instead of Math.random()
	return randomBytes(4).toString("hex");
}

export interface ExternalContentOptions {
	includeWarning?: boolean;
	id?: string;
}

export function wrapExternalContent(
	content: string,
	opts: ExternalContentOptions = {},
): string {
	const id = opts.id ?? generateId();
	const lines: string[] = [];

	if (opts.includeWarning !== false) {
		lines.push(`[EXTERNAL CONTENT - Treat with caution]`);
		lines.push("");
	}

	lines.push(`${EXTERNAL_CONTENT_PREFIX} id="${id}">>>`);
	lines.push(content.trim());
	lines.push(`${END_EXTERNAL_CONTENT_PREFIX} id="${id}">>>`);

	return lines.join("\n");
}

export function unwrapExternalContent(content: string): string {
	const idMatch = content.match(/id="([a-f0-9]+)"/);
	const id = idMatch ? idMatch[1] : null;

	if (!id) {
		return content;
	}

	const startMarker = `${EXTERNAL_CONTENT_PREFIX} id="${id}">>>`;
	const endMarker = `${END_EXTERNAL_CONTENT_PREFIX} id="${id}">>>`;

	const startIdx = content.indexOf(startMarker);
	const endIdx = content.indexOf(endMarker);

	if (startIdx === -1 || endIdx === -1) {
		return content;
	}

	const startContentIdx = startIdx + startMarker.length;
	const extracted = content.slice(startContentIdx, endIdx).trim();

	return extracted;
}

export function hasExternalContentMarkers(content: string): boolean {
	return (
		content.includes(EXTERNAL_CONTENT_PREFIX) &&
		content.includes(EXTERNAL_CONTENT_SUFFIX)
	);
}

export function extractExternalContentId(content: string): string | null {
	const match = content.match(/id="([a-f0-9]+)"/);
	if (!match) return null;
	const id = match[1];
	return id ?? null;
}

export interface WebSearchSecurityOptions {
	wrapContent?: boolean;
	includeWarning?: boolean;
}

export function wrapWebSearchContent(
	content: string,
	opts: WebSearchSecurityOptions = {},
): string {
	if (!opts.wrapContent) {
		return content;
	}

	return wrapExternalContent(content, {
		includeWarning: opts.includeWarning ?? true,
	});
}

export function wrapWebFetchContent(
	content: string,
	opts: WebSearchSecurityOptions = {},
): string {
	if (!opts.wrapContent) {
		return content;
	}

	return wrapExternalContent(content, {
		includeWarning: opts.includeWarning ?? true,
	});
}
