import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { safeFilename } from "../../utils/helpers";
import { Session } from "../../session/manager";
import type {
  DailySummaryResult,
  MemoryBackend,
  MemoryEventRecord,
  MentalImageObservation,
} from "../backend";

const SESSION_PRIMER_CHARS = 220;
const MENTAL_IMAGE_MAX_CHARS = 220;
const DAILY_TIMELINE_LIMIT = 120;

function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

function localDate(tsMs = Date.now()): string {
  const d = new Date(tsMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function short(text: string, max = SESSION_PRIMER_CHARS): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length <= max ? compact : `${compact.slice(0, max)}`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function sessionPath(sessionsDir: string, sessionKey: string): string {
  return join(sessionsDir, `${safeFilename(sessionKey.replace(":", "_"))}.jsonl`);
}

function newestSessionFile(sessionsDir: string): string | null {
  if (!existsSync(sessionsDir)) return null;
  const files = readdirSync(sessionsDir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => ({
      name,
      path: join(sessionsDir, name),
      mtimeMs: statSync(join(sessionsDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return files[0]?.path ?? null;
}

function parseSessionPrimer(path: string, limit = 8): string {
  try {
    const lines = readFileSync(path, "utf-8").split(/\r?\n/).filter(Boolean);
    const messages: Array<{ role: string; content: string }> = [];
    for (const line of lines) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (String(parsed._type ?? "") === "metadata") continue;
      const role = String(parsed.role ?? "").trim();
      if (!role) continue;
      const content = short(String(parsed.content ?? ""));
      if (!content) continue;
      messages.push({ role, content });
    }

    if (!messages.length) return "";
    const tail = messages.slice(-Math.max(1, limit));
    const rows = tail.map((msg) => `- ${msg.role}: ${msg.content}`);
    return [
      "# Session Primer",
      "Recent session context from local JSONL history:",
      ...rows,
    ].join("\n");
  } catch {
    return "";
  }
}

function formatMentalLine(observation: MentalImageObservation): string {
  const timestamp = new Date(observation.timestampMs ?? Date.now()).toISOString();
  const content = short(observation.content, MENTAL_IMAGE_MAX_CHARS);
  return `- ${timestamp} [${observation.channel}/${observation.senderId}] ${content}`;
}

export class StaticSqliteMemoryBackend implements MemoryBackend {
  private readonly workspace: string;
  private readonly memoryDir: string;
  private readonly sessionsDir: string;
  private readonly dailyDir: string;
  private readonly mentalImagePath: string;
  private readonly db: Database;

  constructor(workspace: string) {
    this.workspace = workspace;
    this.memoryDir = ensureDir(join(workspace, "memory"));
    this.sessionsDir = ensureDir(join(workspace, "sessions"));
    this.dailyDir = ensureDir(join(this.memoryDir, "daily"));
    this.mentalImagePath = join(this.memoryDir, "MENTAL_IMAGE.locked.md");
    this.db = new Database(join(this.memoryDir, "events.sqlite"));
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at_ms INTEGER NOT NULL,
        day TEXT NOT NULL,
        kind TEXT NOT NULL,
        scope TEXT NOT NULL,
        action TEXT NOT NULL,
        summary TEXT NOT NULL,
        session_key TEXT,
        details_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_events_day_created ON events(day, created_at_ms);
      CREATE INDEX IF NOT EXISTS idx_events_session_created ON events(session_key, created_at_ms);
    `);

    if (!existsSync(this.mentalImagePath)) {
      writeFileSync(
        this.mentalImagePath,
        [
          "# MENTAL_IMAGE.locked.md",
          "",
          "Private behavioral observations for long-term user understanding.",
          "",
        ].join("\n"),
        "utf-8",
      );
    }
  }

  getMemoryContext(): string {
    const memoryPath = join(this.memoryDir, "MEMORY.md");
    if (!existsSync(memoryPath)) return "";
    try {
      return readFileSync(memoryPath, "utf-8").trim();
    } catch {
      return "";
    }
  }

  async consolidate(_session: Session, _provider: any, _model: string, _opts: { archive_all: boolean; memory_window: number }): Promise<boolean> {
    try {
      ensureDir(this.memoryDir);
      return true;
    } catch {
      return false;
    }
  }

  recordEvent(event: MemoryEventRecord): void {
    const ts = event.timestamp_ms ?? Date.now();
    const day = localDate(ts);
    const stmt = this.db.prepare(`
      INSERT INTO events(created_at_ms, day, kind, scope, action, summary, session_key, details_json)
      VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    `);
    stmt.run(
      ts,
      day,
      String(event.kind || "event"),
      String(event.scope || "runtime"),
      String(event.action || "update"),
      short(String(event.summary ?? ""), 256),
      event.session_key ? String(event.session_key) : null,
      safeJson(event.details ?? {}),
    );
  }

  getSessionPrimer(sessionKey: string, limit = 8): string {
    const specific = sessionPath(this.sessionsDir, sessionKey);
    if (existsSync(specific)) {
      const primer = parseSessionPrimer(specific, limit);
      if (primer) return primer;
    }
    const latest = newestSessionFile(this.sessionsDir);
    if (!latest) return "";
    return parseSessionPrimer(latest, limit);
  }

  updateMentalImage(observation: MentalImageObservation): void {
    const content = short(observation.content, MENTAL_IMAGE_MAX_CHARS);
    if (!content) return;

    const line = formatMentalLine({ ...observation, content });
    try {
      const current = existsSync(this.mentalImagePath) ? readFileSync(this.mentalImagePath, "utf-8") : "";
      const last = current.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? "";
      if (last === line) return;
      const next = `${current.endsWith("\n") || !current ? current : `${current}\n`}${line}\n`;
      writeFileSync(this.mentalImagePath, next, "utf-8");
    } catch {
      // Best effort memory update.
    }
  }

  writeDailySummary(date = localDate()): DailySummaryResult {
    const rows = this.db.prepare(`
      SELECT created_at_ms, kind, scope, action, summary
      FROM events
      WHERE day = ?1
      ORDER BY created_at_ms ASC
    `).all(date) as Array<{
      created_at_ms: number;
      kind: string;
      scope: string;
      action: string;
      summary: string;
    }>;

    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.kind}:${row.scope}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const sections: string[] = [];
    sections.push(`# Daily Summary ${date}`);
    sections.push("");
    sections.push(`Total events: ${rows.length}`);
    sections.push("");

    sections.push("## By Scope");
    if (!counts.size) {
      sections.push("- No events recorded.");
    } else {
      const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      for (const [key, count] of entries) sections.push(`- ${key}: ${count}`);
    }
    sections.push("");

    sections.push("## Timeline");
    if (!rows.length) {
      sections.push("- No activity.");
    } else {
      const timeline = rows.slice(-DAILY_TIMELINE_LIMIT);
      for (const row of timeline) {
        const iso = new Date(row.created_at_ms).toISOString();
        sections.push(`- ${iso} [${row.kind}][${row.scope}] ${row.action} ${short(row.summary, 80)}`.trim());
      }
    }
    sections.push("");

    const target = join(this.dailyDir, `${date}.md`);
    writeFileSync(target, sections.join("\n"), "utf-8");
    return { path: target, date, eventCount: rows.length };
  }
}
