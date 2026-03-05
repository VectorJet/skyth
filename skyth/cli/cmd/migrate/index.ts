import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join } from "node:path";
import { channelsEditCommand } from "@/cli/cmd/channels";
import { loadConfig, saveConfig } from "@/cli/cmd/../../config/loader";
import { safeFilename } from "@/cli/cmd/../../utils/helpers";

type Direction = "from" | "to";
type Target = "openclaw";

export interface MigrateArgs {
  direction?: string;
  target?: string;
}

export interface MigrateResult {
  exitCode: number;
  output: string;
}

interface SkythSessionDoc {
  key: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  lastConsolidated: number;
  messages: Array<Record<string, unknown>>;
}

function usage(): string {
  return [
    "Usage: skyth migrate <from|to> openclaw",
    "",
    "Examples:",
    "  skyth migrate from openclaw",
    "  skyth migrate to openclaw",
  ].join("\n");
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function readLines(path: string): string[] {
  try {
    return readFileSync(path, "utf-8").split(/\r?\n/).filter((line) => line.trim().length > 0);
  } catch {
    return [];
  }
}

function safeSessionPath(workspace: string, key: string): string {
  return join(workspace, "sessions", `${safeFilename(key.replace(":", "_"))}.jsonl`);
}

function copyDirectoryContents(sourceDir: string, targetDir: string, excludeDirs: Set<string> = new Set()): number {
  if (!existsSync(sourceDir)) return 0;
  ensureDir(targetDir);
  let copied = 0;
  for (const entry of readdirSync(sourceDir)) {
    if (excludeDirs.has(entry)) continue;
    const source = join(sourceDir, entry);
    const target = join(targetDir, entry);
    cpSync(source, target, { recursive: true, force: true, preserveTimestamps: true });
    copied += 1;
  }
  return copied;
}

function flattenOpenClawContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content ?? "");
  const chunks: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      chunks.push(part);
      continue;
    }
    if (part && typeof part === "object") {
      const obj = part as Record<string, unknown>;
      if (typeof obj.text === "string") chunks.push(obj.text);
      else chunks.push(JSON.stringify(obj));
      continue;
    }
    chunks.push(String(part ?? ""));
  }
  return chunks.join("\n").trim();
}

function parseOpenClawSessionKeyIndex(indexPath: string): Map<string, string> {
  const data = readJson<Record<string, any>>(indexPath, {});
  const out = new Map<string, string>();
  for (const [sessionKey, payload] of Object.entries(data)) {
    if (!payload || typeof payload !== "object") continue;
    const sessionId = String(payload.sessionId ?? "").trim();
    if (!sessionId) continue;
    const deliveryTo = String(payload.deliveryContext?.to ?? payload.origin?.to ?? "").trim();
    const resolvedKey = deliveryTo || sessionKey || sessionId;
    out.set(sessionId, resolvedKey);
  }
  return out;
}

function convertOpenClawSession(path: string, index: Map<string, string>): SkythSessionDoc | undefined {
  const lines = readLines(path);
  if (!lines.length) return undefined;
  const fallback = new Date().toISOString();

  let sessionId = "";
  let createdAt = fallback;
  let updatedAt = fallback;
  let lastTs = 0;
  const messages: Array<Record<string, unknown>> = [];

  for (const line of lines) {
    let event: Record<string, any>;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    const ts = String(event.timestamp ?? "");
    const tsMs = Number(new Date(ts).getTime());
    if (Number.isFinite(tsMs) && tsMs > lastTs) {
      lastTs = tsMs;
      updatedAt = new Date(tsMs).toISOString();
    }

    if (event.type === "session") {
      sessionId = String(event.id ?? "").trim() || sessionId;
      if (ts) createdAt = ts;
      continue;
    }

    if (event.type !== "message") continue;
    const msg = event.message;
    if (!msg || typeof msg !== "object") continue;

    const role = String(msg.role ?? "").trim() || "assistant";
    const content = flattenOpenClawContent((msg as Record<string, unknown>).content);
    const messageTs = msg.timestamp ?? event.timestamp ?? Date.now();
    const messageIso = typeof messageTs === "number"
      ? new Date(messageTs).toISOString()
      : (String(messageTs || "").trim() || fallback);

    const item: Record<string, unknown> = {
      role,
      content,
      timestamp: messageIso,
    };
    for (const key of ["tool_calls", "tool_call_id", "name"]) {
      if (msg[key] !== undefined) item[key] = msg[key];
    }
    messages.push(item);
  }

  const fileBase = path.split("/").at(-1)?.replace(/\.jsonl$/, "") ?? "";
  const resolvedId = sessionId || fileBase || `openclaw_${Date.now()}`;
  const resolvedKey = index.get(resolvedId) ?? resolvedId;
  return {
    key: resolvedKey,
    createdAt,
    updatedAt,
    metadata: {
      imported_from: "openclaw",
      session_id: resolvedId,
      source_file: path,
    },
    lastConsolidated: 0,
    messages,
  };
}

function writeSkythSession(workspace: string, session: SkythSessionDoc): void {
  const sessionPath = safeSessionPath(workspace, session.key);
  ensureDir(dirname(sessionPath));
  const lines = [
    JSON.stringify({
      _type: "metadata",
      key: session.key,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      metadata: session.metadata,
      last_consolidated: session.lastConsolidated,
    }),
    ...session.messages.map((message) => JSON.stringify(message)),
  ];
  writeFileSync(sessionPath, `${lines.join("\n")}\n`, "utf-8");
}

function convertSkythSession(path: string, openclawWorkspace: string): {
  id: string;
  key: string;
  updatedAtMs: number;
  events: Array<Record<string, unknown>>;
} | undefined {
  const lines = readLines(path);
  if (!lines.length) return undefined;

  let key = path.split("/").at(-1)?.replace(/\.jsonl$/, "") ?? "";
  let createdAt = new Date().toISOString();
  let updatedAt = createdAt;
  let parentId: string | null = null;
  const events: Array<Record<string, unknown>> = [];

  for (const line of lines) {
    let row: Record<string, any>;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row._type === "metadata") {
      key = String(row.key ?? key);
      createdAt = String(row.created_at ?? createdAt);
      updatedAt = String(row.updated_at ?? updatedAt);
      continue;
    }

    const id = Math.random().toString(16).slice(2, 10);
    const timestamp = String(row.timestamp ?? updatedAt);
    const role = String(row.role ?? "assistant");
    const content = String(row.content ?? "");
    events.push({
      type: "message",
      id,
      parentId,
      timestamp,
      message: {
        role,
        content: [{ type: "text", text: content }],
        timestamp: Number(new Date(timestamp).getTime()),
      },
    });
    parentId = id;
  }

  const id = key.replace(/[^a-zA-Z0-9_-]/g, "").slice(-36) || Math.random().toString(16).slice(2);
  const sessionEvent = {
    type: "session",
    version: 3,
    id,
    timestamp: createdAt,
    cwd: openclawWorkspace,
  };
  return {
    id,
    key,
    updatedAtMs: Number(new Date(updatedAt).getTime()) || Date.now(),
    events: [sessionEvent, ...events],
  };
}

function mapOpenClawKindToSkyth(kind: unknown): "system_event" | "agent_turn" | "daily_summary" {
  const value = String(kind ?? "").trim().toLowerCase();
  if (value === "daily_summary" || value === "dailysummary") return "daily_summary";
  if (value === "agent_turn" || value === "agentturn") return "agent_turn";
  return "system_event";
}

function mapSkythKindToOpenClaw(kind: unknown): "systemEvent" | "agentTurn" {
  const value = String(kind ?? "").trim().toLowerCase();
  if (value === "agent_turn" || value === "agentturn") return "agentTurn";
  return "systemEvent";
}

function convertOpenClawCronJobs(sourcePath: string, targetPath: string): number {
  const source = readJson<{ version?: number; jobs?: Array<Record<string, any>> }>(sourcePath, { version: 1, jobs: [] });
  const jobs = Array.isArray(source.jobs) ? source.jobs : [];
  const migrated = jobs.map((job) => {
    const schedule = job.schedule ?? {};
    const kind = String(schedule.kind ?? "every");
    const mappedSchedule: Record<string, unknown> = { kind };
    if (kind === "every") mappedSchedule.every_ms = Number(schedule.everyMs ?? schedule.every_ms ?? 0);
    if (kind === "cron") {
      mappedSchedule.expr = String(schedule.expr ?? "");
      if (schedule.tz) mappedSchedule.tz = String(schedule.tz);
    }
    if (kind === "at") {
      const atRaw = schedule.at ?? schedule.atMs ?? schedule.at_ms;
      const atMs = typeof atRaw === "number" ? atRaw : Number(new Date(String(atRaw)).getTime());
      if (Number.isFinite(atMs)) mappedSchedule.at_ms = atMs;
    }

    return {
      id: String(job.id ?? Math.random().toString(16).slice(2, 10)),
      name: String(job.name ?? "migrated_job"),
      enabled: Boolean(job.enabled ?? true),
      schedule: mappedSchedule,
      payload: {
        kind: mapOpenClawKindToSkyth(job.payload?.kind),
        message: String(job.payload?.text ?? job.payload?.message ?? ""),
        deliver: false,
      },
      state: {
        next_run_at_ms: Number(job.state?.nextRunAtMs ?? 0) || undefined,
        last_run_at_ms: Number(job.state?.lastRunAtMs ?? 0) || undefined,
        last_status: String(job.state?.lastStatus ?? "").toLowerCase() === "error"
          ? "error"
          : String(job.state?.lastStatus ?? "").toLowerCase() === "skipped"
          ? "skipped"
          : "ok",
        last_error: job.state?.lastError ? String(job.state.lastError) : undefined,
      },
      created_at_ms: Number(job.createdAtMs ?? Date.now()),
      updated_at_ms: Number(job.updatedAtMs ?? Date.now()),
      delete_after_run: Boolean(job.deleteAfterRun ?? job.delete_after_run),
    };
  });

  writeJson(targetPath, { version: 1, jobs: migrated });
  return migrated.length;
}

function convertSkythCronJobs(sourcePath: string, targetPath: string): number {
  const source = readJson<{ version?: number; jobs?: Array<Record<string, any>> }>(sourcePath, { version: 1, jobs: [] });
  const jobs = Array.isArray(source.jobs) ? source.jobs : [];
  const migrated = jobs.map((job) => {
    const schedule = job.schedule ?? {};
    const kind = String(schedule.kind ?? "every");
    const mappedSchedule: Record<string, unknown> = { kind };
    if (kind === "every") {
      const everyMs = Number(schedule.every_ms ?? schedule.everyMs ?? 0);
      mappedSchedule.everyMs = everyMs;
      mappedSchedule.anchorMs = Number(job.created_at_ms ?? Date.now());
    }
    if (kind === "cron") {
      mappedSchedule.expr = String(schedule.expr ?? "");
      if (schedule.tz) mappedSchedule.tz = String(schedule.tz);
    }
    if (kind === "at") {
      const atMs = Number(schedule.at_ms ?? schedule.atMs ?? 0);
      if (Number.isFinite(atMs) && atMs > 0) mappedSchedule.at = new Date(atMs).toISOString();
    }

    const lastStatus = String(job.state?.last_status ?? "ok");
    return {
      id: String(job.id ?? Math.random().toString(16).slice(2)),
      agentId: "main",
      name: String(job.name ?? "migrated_job"),
      enabled: Boolean(job.enabled ?? true),
      createdAtMs: Number(job.created_at_ms ?? Date.now()),
      updatedAtMs: Number(job.updated_at_ms ?? Date.now()),
      schedule: mappedSchedule,
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      payload: {
        kind: mapSkythKindToOpenClaw(job.payload?.kind),
        text: String(job.payload?.message ?? ""),
      },
      state: {
        nextRunAtMs: Number(job.state?.next_run_at_ms ?? 0) || undefined,
        lastRunAtMs: Number(job.state?.last_run_at_ms ?? 0) || undefined,
        lastStatus,
        lastError: job.state?.last_error ? String(job.state.last_error) : undefined,
        consecutiveErrors: lastStatus === "error" ? 1 : 0,
      },
      deleteAfterRun: Boolean(job.delete_after_run),
    };
  });

  writeJson(targetPath, { version: 1, jobs: migrated });
  return migrated.length;
}

function listDailyMarkdownFiles(memoryDir: string): string[] {
  if (!existsSync(memoryDir)) return [];
  const out: string[] = [];
  const dailyRegex = /^\d{4}-\d{2}-\d{2}(?:[-_].*)?\.md$/i;

  for (const entry of readdirSync(memoryDir)) {
    const path = join(memoryDir, entry);
    const stats = statSync(path);
    if (stats.isFile() && dailyRegex.test(entry)) out.push(path);
  }

  const dailyDir = join(memoryDir, "daily");
  if (existsSync(dailyDir)) {
    for (const entry of readdirSync(dailyDir)) {
      const path = join(dailyDir, entry);
      const stats = statSync(path);
      if (stats.isFile() && entry.toLowerCase().endsWith(".md")) out.push(path);
    }
  }
  return out;
}

function migrateOpenClawToSkyth(): MigrateResult {
  const home = process.env.HOME || homedir();
  const openclawRoot = join(home, ".openclaw");
  const skythRoot = join(home, ".skyth");

  if (!existsSync(openclawRoot)) {
    return { exitCode: 1, output: `Error: source not found: ${openclawRoot}` };
  }

  const openclawWorkspace = join(openclawRoot, "workspace");
  const skythWorkspace = join(skythRoot, "workspace");
  ensureDir(skythRoot);
  ensureDir(skythWorkspace);

  const copiedWorkspaceEntries = copyDirectoryContents(openclawWorkspace, skythWorkspace, new Set(["memory"]));
  const copiedAgentEntries = copyDirectoryContents(join(openclawRoot, "agents"), join(skythWorkspace, "agents"));

  let convertedSessions = 0;
  const openclawSessionsDir = join(openclawRoot, "agents", "main", "sessions");
  const sessionIndex = parseOpenClawSessionKeyIndex(join(openclawSessionsDir, "sessions.json"));
  if (existsSync(openclawSessionsDir)) {
    const usedPaths = new Set<string>();
    for (const file of readdirSync(openclawSessionsDir)) {
      if (extname(file) !== ".jsonl") continue;
      if (file.endsWith(".jsonl.lock")) continue;
      const converted = convertOpenClawSession(join(openclawSessionsDir, file), sessionIndex);
      if (!converted) continue;
      let key = converted.key;
      let targetPath = safeSessionPath(skythWorkspace, key);
      if (usedPaths.has(targetPath)) {
        key = String(converted.metadata.session_id ?? key);
        targetPath = safeSessionPath(skythWorkspace, key);
      }
      converted.key = key;
      writeSkythSession(skythWorkspace, converted);
      usedPaths.add(targetPath);
      convertedSessions += 1;
    }
  }

  const copiedDailyFiles = (() => {
    const files = listDailyMarkdownFiles(join(openclawWorkspace, "memory"));
    const target = join(skythWorkspace, "memory", "daily");
    ensureDir(target);
    for (const file of files) {
      cpSync(file, join(target, file.split("/").at(-1)!), { force: true });
    }
    return files.length;
  })();

  const copiedHeartbeatState = (() => {
    const source = join(openclawWorkspace, "memory", "heartbeat-state.json");
    const target = join(skythWorkspace, "memory", "heartbeat-state.json");
    if (!existsSync(source)) return false;
    ensureDir(dirname(target));
    cpSync(source, target, { force: true });
    return true;
  })();

  const convertedCronJobs = convertOpenClawCronJobs(
    join(openclawRoot, "cron", "jobs.json"),
    join(skythRoot, "cron", "jobs.json"),
  );
  const copiedCronRuns = copyDirectoryContents(join(openclawRoot, "cron", "runs"), join(skythRoot, "cron", "runs"));

  const openclawCfg = readJson<Record<string, any>>(join(openclawRoot, "openclaw.json"), {});
  const telegramAllow = readJson<{ allowFrom?: unknown[] }>(
    join(openclawRoot, "credentials", "telegram-allowFrom.json"),
    { allowFrom: [] },
  );
  const allowFrom = Array.isArray(telegramAllow.allowFrom)
    ? telegramAllow.allowFrom.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const telegramConfig = openclawCfg.channels?.telegram ?? {};
  const channelPatch: Record<string, unknown> = {
    enabled: Boolean(telegramConfig.enabled ?? true),
    allow_from: allowFrom,
  };
  const token = String(telegramConfig.botToken ?? telegramConfig.token ?? "").trim();
  if (token) channelPatch.token = token;
  channelsEditCommand(
    { channel: "telegram", json: JSON.stringify(channelPatch) },
    { channelsDir: join(skythRoot, "channels"), authDir: join(skythRoot, "auth") },
  );

  const model = String(openclawCfg.agents?.defaults?.model?.primary ?? "").trim();
  if (model) {
    const cfg = loadConfig();
    cfg.primary_model = model;
    cfg.agents.defaults.model = model;
    cfg.primary_model_provider = model.includes("/") ? model.split("/", 1)[0] || cfg.primary_model_provider : cfg.primary_model_provider;
    saveConfig(cfg);
  }

  const output = [
    "Migration complete: openclaw -> skyth",
    `workspace entries copied: ${copiedWorkspaceEntries}`,
    `agent entries copied: ${copiedAgentEntries}`,
    `sessions converted: ${convertedSessions}`,
    `daily markdown files copied: ${copiedDailyFiles}`,
    `cron jobs converted: ${convertedCronJobs}`,
    `cron run files copied: ${copiedCronRuns}`,
    `heartbeat state copied: ${copiedHeartbeatState ? "yes" : "no"}`,
    `telegram allowlist entries: ${allowFrom.length}`,
    model ? `primary model set: ${model}` : "primary model set: unchanged",
  ].join("\n");
  return { exitCode: 0, output };
}

function migrateSkythToOpenClaw(): MigrateResult {
  const home = process.env.HOME || homedir();
  const openclawRoot = join(home, ".openclaw");
  const skythRoot = join(home, ".skyth");

  if (!existsSync(skythRoot)) {
    return { exitCode: 1, output: `Error: source not found: ${skythRoot}` };
  }

  const openclawWorkspace = join(openclawRoot, "workspace");
  const skythWorkspace = join(skythRoot, "workspace");
  ensureDir(openclawRoot);
  ensureDir(openclawWorkspace);

  const copiedWorkspaceEntries = copyDirectoryContents(skythWorkspace, openclawWorkspace);
  const copiedAgentEntries = copyDirectoryContents(join(skythWorkspace, "agents"), join(openclawRoot, "agents"));

  const copiedDailyFiles = (() => {
    const files = listDailyMarkdownFiles(join(skythWorkspace, "memory"));
    const target = join(openclawWorkspace, "memory");
    ensureDir(target);
    for (const file of files) {
      cpSync(file, join(target, file.split("/").at(-1)!), { force: true });
    }
    return files.length;
  })();

  const copiedHeartbeatState = (() => {
    const source = join(skythWorkspace, "memory", "heartbeat-state.json");
    const target = join(openclawWorkspace, "memory", "heartbeat-state.json");
    if (!existsSync(source)) return false;
    ensureDir(dirname(target));
    cpSync(source, target, { force: true });
    return true;
  })();

  const convertedCronJobs = convertSkythCronJobs(
    join(skythRoot, "cron", "jobs.json"),
    join(openclawRoot, "cron", "jobs.json"),
  );
  const copiedCronRuns = copyDirectoryContents(join(skythRoot, "cron", "runs"), join(openclawRoot, "cron", "runs"));

  let convertedSessions = 0;
  const skythSessionsDir = join(skythWorkspace, "sessions");
  const openclawSessionsDir = join(openclawRoot, "agents", "main", "sessions");
  ensureDir(openclawSessionsDir);
  const sessionIndex: Record<string, unknown> = readJson<Record<string, unknown>>(
    join(openclawSessionsDir, "sessions.json"),
    {},
  );
  if (existsSync(skythSessionsDir)) {
    for (const file of readdirSync(skythSessionsDir)) {
      if (!file.endsWith(".jsonl")) continue;
      if (file.endsWith(".jsonl.lock")) continue;
      const converted = convertSkythSession(join(skythSessionsDir, file), openclawWorkspace);
      if (!converted) continue;
      const targetPath = join(openclawSessionsDir, `${converted.id}.jsonl`);
      const lines = converted.events.map((event) => JSON.stringify(event));
      writeFileSync(targetPath, `${lines.join("\n")}\n`, "utf-8");

      const key = converted.key.includes(":") ? converted.key : `agent:main:${converted.key}`;
      const to = converted.key.includes(":") ? converted.key : `cli:${converted.key}`;
      const channel = to.includes(":") ? to.split(":", 1)[0] : "cli";
      sessionIndex[key] = {
        sessionId: converted.id,
        updatedAt: converted.updatedAtMs,
        systemSent: true,
        abortedLastRun: false,
        chatType: "direct",
        deliveryContext: {
          channel,
          to,
          accountId: "default",
        },
        lastTo: to,
        origin: {
          provider: channel,
          surface: channel,
          chatType: "direct",
          from: to,
          to,
          accountId: "default",
        },
        sessionFile: targetPath,
      };
      convertedSessions += 1;
    }
  }
  writeJson(join(openclawSessionsDir, "sessions.json"), sessionIndex);

  const cfg = loadConfig();
  const model = String(cfg.primary_model || cfg.agents.defaults.model || "").trim();
  const token = String(cfg.channels.telegram?.token ?? "").trim();
  const allowFrom = Array.isArray(cfg.channels.telegram?.allow_from)
    ? cfg.channels.telegram.allow_from.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];

  const openclawConfigPath = join(openclawRoot, "openclaw.json");
  const openclawCfg = readJson<Record<string, any>>(openclawConfigPath, {});
  openclawCfg.agents = openclawCfg.agents ?? {};
  openclawCfg.agents.defaults = openclawCfg.agents.defaults ?? {};
  openclawCfg.agents.defaults.workspace = openclawWorkspace;
  openclawCfg.agents.defaults.model = openclawCfg.agents.defaults.model ?? {};
  if (model) openclawCfg.agents.defaults.model.primary = model;

  openclawCfg.channels = openclawCfg.channels ?? {};
  openclawCfg.channels.telegram = openclawCfg.channels.telegram ?? {};
  openclawCfg.channels.telegram.enabled = Boolean(cfg.channels.telegram?.enabled);
  if (token) openclawCfg.channels.telegram.botToken = token;
  if (allowFrom.length) openclawCfg.channels.telegram.allowFrom = allowFrom;
  writeJson(openclawConfigPath, openclawCfg);

  writeJson(join(openclawRoot, "credentials", "telegram-allowFrom.json"), {
    version: 1,
    allowFrom,
  });
  if (!existsSync(join(openclawRoot, "credentials", "telegram-pairing.json"))) {
    writeJson(join(openclawRoot, "credentials", "telegram-pairing.json"), {
      version: 1,
      requests: [],
    });
  }

  const output = [
    "Migration complete: skyth -> openclaw",
    `workspace entries copied: ${copiedWorkspaceEntries}`,
    `agent entries copied: ${copiedAgentEntries}`,
    `sessions converted: ${convertedSessions}`,
    `daily markdown files copied: ${copiedDailyFiles}`,
    `cron jobs converted: ${convertedCronJobs}`,
    `cron run files copied: ${copiedCronRuns}`,
    `heartbeat state copied: ${copiedHeartbeatState ? "yes" : "no"}`,
    `telegram allowlist entries: ${allowFrom.length}`,
    model ? `primary model set: ${model}` : "primary model set: unchanged",
  ].join("\n");
  return { exitCode: 0, output };
}

export async function migrateCommand(args: MigrateArgs): Promise<MigrateResult> {
  const direction = String(args.direction ?? "").trim().toLowerCase();
  const target = String(args.target ?? "").trim().toLowerCase();
  if (!direction || !target || target === "help" || direction === "help") {
    return { exitCode: 0, output: usage() };
  }
  if (target !== "openclaw") {
    return { exitCode: 1, output: `Error: unsupported migrate target '${target}'.\n\n${usage()}` };
  }
  if (direction !== "from" && direction !== "to") {
    return { exitCode: 1, output: `Error: unsupported migrate direction '${direction}'.\n\n${usage()}` };
  }
  if ((direction as Direction) === "from" && (target as Target) === "openclaw") {
    return migrateOpenClawToSkyth();
  }
  return migrateSkythToOpenClaw();
}
