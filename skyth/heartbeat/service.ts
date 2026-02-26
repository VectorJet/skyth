import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eventLine } from "../logging/events";

export const DEFAULT_HEARTBEAT_INTERVAL_S = 30 * 60;
export const HEARTBEAT_PROMPT = "Read HEARTBEAT.md in your workspace (if it exists). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.";
export const HEARTBEAT_OK_TOKEN = "HEARTBEAT_OK";

function isHeartbeatEmpty(content: string | undefined): boolean {
  if (!content) return true;
  const cleaned = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//") && !line.startsWith("<!--"));
  return cleaned.length === 0;
}

export class HeartbeatService {
  private readonly workspace: string;
  private readonly intervalS: number;
  private readonly enabled: boolean;
  private readonly onHeartbeat?: (prompt: string) => Promise<string>;
  private readonly onEvent?: (kind: "heartbeat", scope: string, action: string, summary?: string) => void;
  private running = false;
  private task?: Promise<void>;

  constructor(params: {
    workspace: string;
    on_heartbeat?: (prompt: string) => Promise<string>;
    on_event?: (kind: "heartbeat", scope: string, action: string, summary?: string) => void;
    interval_s?: number;
    enabled?: boolean;
  }) {
    this.workspace = params.workspace;
    this.onHeartbeat = params.on_heartbeat;
    this.onEvent = params.on_event;
    this.intervalS = params.interval_s ?? DEFAULT_HEARTBEAT_INTERVAL_S;
    this.enabled = params.enabled ?? true;
  }

  get heartbeatFile(): string {
    return join(this.workspace, "HEARTBEAT.md");
  }

  private readHeartbeatFile(): string | undefined {
    if (!existsSync(this.heartbeatFile)) return undefined;
    try {
      return readFileSync(this.heartbeatFile, "utf-8");
    } catch {
      return undefined;
    }
  }

  async start(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    this.emit("heartbeat", "gateway", "alive");
    this.task = this.runLoop();
  }

  stop(): void {
    this.running = false;
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, this.intervalS * 1000));
      if (!this.running) return;
      try {
        await this.tick();
      } catch {
        // noop
      }
    }
  }

  async tick(): Promise<string | undefined> {
    const content = this.readHeartbeatFile();
    if (isHeartbeatEmpty(content)) {
      this.emit("heartbeat", "gateway", "idle");
      return HEARTBEAT_OK_TOKEN;
    }
    if (!this.onHeartbeat) return undefined;
    this.emit("heartbeat", "gateway", "run");
    const out = await this.onHeartbeat(HEARTBEAT_PROMPT);
    this.emit("heartbeat", "gateway", "done", out);
    return out;
  }

  private emit(kind: "heartbeat", scope: string, action: string, summary = ""): void {
    console.log(eventLine(kind, scope, action, summary));
    this.onEvent?.(kind, scope, action, summary);
  }
}
