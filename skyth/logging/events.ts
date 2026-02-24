export type EventKind = "event" | "heartbeat" | "cron";

const SUMMARY_MAX = 15;

function clampSummary(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length <= SUMMARY_MAX ? compact : compact.slice(0, SUMMARY_MAX);
}

export function eventLine(
  kind: EventKind,
  scope: string,
  action: string,
  summary?: string,
): string {
  const cleanScope = scope.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "runtime";
  const cleanAction = action.replace(/\s+/g, " ").trim().toLowerCase() || "update";
  const short = clampSummary(summary ?? "");
  return `[${kind}][${cleanScope}] ${cleanAction}${short ? ` ${short}` : ""}`;
}
