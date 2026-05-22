export type EventKind = "event" | "heartbeat" | "cron" | "handoff";

function clampSummary(raw: string, skip = false): string {
	const compact = raw.replace(/\s+/g, " ").trim();
	if (!compact) return "";
	if (skip) return compact;
	return compact;
}

export function eventLine(
	kind: EventKind,
	scope: string,
	action: string,
	summary?: string,
	skipClamp = false,
): string {
	const cleanScope =
		scope.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "runtime";
	const cleanAction =
		action.replace(/\s+/g, " ").trim().toLowerCase() || "update";
	const short = clampSummary(summary ?? "", skipClamp);
	return `[${kind}][${cleanScope}] ${cleanAction}${short ? ` ${short}` : ""}`;
}
