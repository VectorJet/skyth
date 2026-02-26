import { Session } from "@/session/manager";

export type MemoryEventKind = "event" | "heartbeat" | "cron" | "handoff";

export interface MemoryEventRecord {
  kind: MemoryEventKind;
  scope: string;
  action: string;
  summary?: string;
  details?: Record<string, unknown>;
  session_key?: string;
  timestamp_ms?: number;
}

export interface MentalImageObservation {
  senderId: string;
  channel: string;
  content: string;
  timestampMs?: number;
}

export interface DailySummaryResult {
  path: string;
  date: string;
  eventCount: number;
}

export interface MemoryBackend {
  getMemoryContext(): string;
  consolidate(session: Session, provider: any, model: string, opts: { archive_all: boolean; memory_window: number }): Promise<boolean>;
  recordEvent(event: MemoryEventRecord): void;
  getSessionPrimer(sessionKey: string, limit?: number): string;
  updateMentalImage(observation: MentalImageObservation): void;
  writeDailySummary(date?: string): DailySummaryResult;
}
