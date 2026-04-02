/**
 * Handles benign unhandled rejections from the @homebridge/ciao mDNS library.
 *
 * The ciao library can emit unhandled promise rejections when:
 * - Probing is cancelled during shutdown (CIAO PROBING CANCELLED)
 * - Announcement is cancelled during shutdown (CIAO ANNOUNCEMENT CANCELLED)
 * - Interface assertions (IPV4 address changes)
 *
 * These are not errors and should be silently ignored.
 */

function formatError(err: unknown): string {
	if (err instanceof Error) {
		const trimmedMessage = err.message.trim();
		const msg = trimmedMessage || err.name || String(err).trim();
		if (err.name && err.name !== "Error") {
			return msg === err.name ? err.name : `${err.name}: ${msg}`;
		}
		return msg;
	}
	return String(err);
}

const CIAO_CANCELLATION_MESSAGE_RE = /^CIAO (?:ANNOUNCEMENT|PROBING) CANCELLED\b/u;
const CIAO_INTERFACE_ASSERTION_MESSAGE_RE =
	/Reached illegal state!?\s+IPV4 address change from defined to undefined!?/iu;

export type CiaoUnhandledRejectionClassification =
	| { kind: "cancellation"; formatted: string }
	| { kind: "interface-assertion"; formatted: string };

export function classifyCiaoUnhandledRejection(
	reason: unknown,
): CiaoUnhandledRejectionClassification | null {
	const formatted = formatError(reason);
	const message = formatted.toUpperCase();
	if (CIAO_CANCELLATION_MESSAGE_RE.test(message)) {
		return { kind: "cancellation", formatted };
	}
	if (CIAO_INTERFACE_ASSERTION_MESSAGE_RE.test(message)) {
		return { kind: "interface-assertion", formatted };
	}
	return null;
}

export function ignoreCiaoUnhandledRejection(reason: unknown): boolean {
	return classifyCiaoUnhandledRejection(reason) !== null;
}