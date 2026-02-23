import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ensureDir, safeFilename } from "../utils/helpers";

export interface SessionMessage {
  role: string;
  content: string;
  [key: string]: any;
}

export class Session {
  readonly key: string;
  messages: SessionMessage[] = [];
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
  metadata: Record<string, any> = {};
  lastConsolidated = 0;

  constructor(key: string) {
    this.key = key;
  }

  addMessage(role: string, content: string, extra: Record<string, any> = {}): void {
    this.messages.push({ role, content, timestamp: new Date().toISOString(), ...extra });
    this.updatedAt = new Date();
  }

  getHistory(maxMessages = 500): SessionMessage[] {
    return this.messages.slice(-maxMessages).map((m) => {
      const out: SessionMessage = { role: m.role, content: m.content ?? "" };
      for (const key of ["tool_calls", "tool_call_id", "name"]) {
        if (key in m) out[key] = m[key];
      }
      return out;
    });
  }

  clear(): void {
    this.messages = [];
    this.lastConsolidated = 0;
    this.updatedAt = new Date();
  }
}

export class SessionManager {
  private readonly workspace: string;
  private readonly sessionsDir: string;
  private readonly legacySessionsDir: string;
  private readonly cache = new Map<string, Session>();

  constructor(workspace: string) {
    this.workspace = workspace;
    this.sessionsDir = ensureDir(join(workspace, "sessions"));
    this.legacySessionsDir = join(homedir(), ".skyth", "sessions");
  }

  private getSessionPath(key: string): string {
    return join(this.sessionsDir, `${safeFilename(key.replace(":", "_"))}.jsonl`);
  }

  private getLegacySessionPath(key: string): string {
    return join(this.legacySessionsDir, `${safeFilename(key.replace(":", "_"))}.jsonl`);
  }

  getOrCreate(key: string): Session {
    const hit = this.cache.get(key);
    if (hit) return hit;

    const loaded = this.load(key) ?? new Session(key);
    this.cache.set(key, loaded);
    return loaded;
  }

  private load(key: string): Session | undefined {
    const path = this.getSessionPath(key);
    if (!existsSync(path)) {
      const legacyPath = this.getLegacySessionPath(key);
      if (existsSync(legacyPath)) {
        mkdirSync(this.sessionsDir, { recursive: true });
        renameSync(legacyPath, path);
      }
    }
    if (!existsSync(path)) return undefined;

    try {
      const lines = readFileSync(path, "utf-8").split(/\r?\n/).filter(Boolean);
      const session = new Session(key);
      for (const line of lines) {
        const data = JSON.parse(line);
        if (data._type === "metadata") {
          session.metadata = data.metadata ?? {};
          if (data.created_at) session.createdAt = new Date(data.created_at);
          if (data.updated_at) session.updatedAt = new Date(data.updated_at);
          session.lastConsolidated = Number(data.last_consolidated ?? 0);
        } else {
          session.messages.push(data);
        }
      }
      return session;
    } catch {
      return undefined;
    }
  }

  save(session: Session): void {
    const path = this.getSessionPath(session.key);
    mkdirSync(this.sessionsDir, { recursive: true });
    const lines = [JSON.stringify({
      _type: "metadata",
      key: session.key,
      created_at: session.createdAt.toISOString(),
      updated_at: session.updatedAt.toISOString(),
      metadata: session.metadata,
      last_consolidated: session.lastConsolidated,
    })];
    for (const msg of session.messages) lines.push(JSON.stringify(msg));
    writeFileSync(path, `${lines.join("\n")}\n`, "utf-8");
    this.cache.set(session.key, session);
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  listSessions(): Array<Record<string, any>> {
    if (!existsSync(this.sessionsDir)) return [];
    const out: Array<Record<string, any>> = [];
    for (const file of readdirSync(this.sessionsDir)) {
      if (!file.endsWith(".jsonl")) continue;
      const path = join(this.sessionsDir, file);
      const firstLine = readFileSync(path, "utf-8").split(/\r?\n/)[0];
      if (!firstLine) continue;
      try {
        const data = JSON.parse(firstLine);
        if (data._type === "metadata") {
          out.push({
            key: data.key ?? file.replace(".jsonl", "").replace("_", ":"),
            created_at: data.created_at,
            updated_at: data.updated_at,
            path,
          });
        }
      } catch {
        continue;
      }
    }
    return out.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  }
}
