import { Session } from "@/session/manager";
import type {
  DailySummaryResult,
  MemoryEventRecord,
  MentalImageObservation,
} from "@/memory/backend";
import { StaticSqliteMemoryBackend } from "@/memory/backends/static_sqlite";

export class MemoryStore {
  readonly workspace: string;
  private readonly backend: StaticSqliteMemoryBackend;

  constructor(workspace: string) {
    this.workspace = workspace;
    this.backend = new StaticSqliteMemoryBackend(workspace);
  }

  getMemoryContext(): string {
    return this.backend.getMemoryContext();
  }

  async consolidate(session: Session, provider: any, model: string, opts: { archive_all: boolean; memory_window: number }): Promise<boolean> {
    return await this.backend.consolidate(session, provider, model, opts);
  }

  recordEvent(event: MemoryEventRecord): void {
    this.backend.recordEvent(event);
  }

  getSessionPrimer(sessionKey: string, limit = 8): string {
    return this.backend.getSessionPrimer(sessionKey, limit);
  }

  updateMentalImage(observation: MentalImageObservation): void {
    this.backend.updateMentalImage(observation);
  }

  writeDailySummary(date?: string): DailySummaryResult {
    return this.backend.writeDailySummary(date);
  }
}
