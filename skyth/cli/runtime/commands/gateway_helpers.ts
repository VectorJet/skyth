import type { CronService } from "@/cron/service";

export interface GatewayNode {
  id: string;
  channel: string;
  sender_id: string;
  verified: boolean;
  trusted: boolean;
}

export function formatDateForGateway(ts: number | string | Date): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getTrustedNodeCounts(
  nodes: GatewayNode[],
  channels: string[],
): { totalUniqueTrusted: number; byChannel: Record<string, string[]> } {
  const uniqueSenders = new Set<string>();
  const byChannel: Record<string, Set<string>> = {};
  
  for (const ch of channels) {
    byChannel[ch] = new Set();
  }
  
  for (const node of nodes) {
    if (node.trusted) {
      uniqueSenders.add(node.sender_id);
      const channelSet = byChannel[node.channel];
      if (channelSet) {
        channelSet.add(node.sender_id);
      }
    }
  }
  
  return {
    totalUniqueTrusted: uniqueSenders.size,
    byChannel: Object.fromEntries(
      Object.entries(byChannel).map(([ch, senders]) => [ch, Array.from(senders)])
    ) as Record<string, string[]>,
  };
}

export function validateGatewayFlags(flags: Record<string, unknown>): string[] {
  const invalid: string[] = [];
  if (flags.port !== undefined && (typeof flags.port !== "string" || isNaN(Number(flags.port)))) {
    invalid.push("port");
  }
  return invalid;
}

export function ensureDailySummaryJob(cron: CronService): void {
  const existing = cron.listJobs(true).find((job) =>
    job.name === "daily_summary_nightly" || job.payload.kind === "daily_summary");
  if (existing) return;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  cron.addJob({
    name: "daily_summary_nightly",
    kind: "daily_summary",
    schedule: { kind: "cron", expr: "55 23 * * *", tz: timezone },
    message: "",
    deliver: false,
  });
}

export interface GatewayEmitter {
  (kind: string, scope: string, action: string, summary?: string, details?: Record<string, unknown>, sessionKey?: string, asError?: boolean, skipClamp?: boolean): void;
}