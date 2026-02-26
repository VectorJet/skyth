import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eventLine } from "../logging/events";
import {
  DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TOKEN,
  isHeartbeatContentEffectivelyEmpty,
  resolveHeartbeatPrompt,
  stripHeartbeatToken,
} from "./heartbeat.js";
import { emitHeartbeatEvent, type HeartbeatEventPayload } from "./events.js";
import { isWithinActiveHours, type ActiveHoursConfig } from "./active-hours.js";
import { resolveHeartbeatVisibility, type ResolvedHeartbeatVisibility } from "./visibility.js";
import {
  requestHeartbeatNow,
  setHeartbeatWakeHandler,
  type HeartbeatRunResult,
} from "./wake.js";

export type HeartbeatConfig = {
  enabled?: boolean;
  everyMs?: number;
  prompt?: string;
  ackMaxChars?: number;
  activeHours?: ActiveHoursConfig;
  showOk?: boolean;
  showAlerts?: boolean;
  useIndicator?: boolean;
};

export type HeartbeatDeliveryTarget = {
  channel: string;
  chatId: string;
  accountId?: string;
};

export type HeartbeatDeps = {
  processMessage: (params: {
    channel: string;
    senderId: string;
    chatId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ content: string } | null>;
  deliver?: (target: HeartbeatDeliveryTarget, content: string) => Promise<void>;
  getQueueSize?: () => number;
  nowMs?: () => number;
};

export type HeartbeatRunner = {
  start: () => void;
  stop: () => void;
  tick: () => Promise<string | undefined>;
  getConfig: () => HeartbeatConfig;
  updateConfig: (config: Partial<HeartbeatConfig>) => void;
};

let heartbeatsEnabled = true;

export function setHeartbeatsEnabled(enabled: boolean) {
  heartbeatsEnabled = enabled;
}

export function isHeartbeatEnabled(config?: HeartbeatConfig): boolean {
  if (!heartbeatsEnabled) return false;
  return config?.enabled ?? true;
}

export class HeartbeatServiceRunner {
  private readonly workspace: string;
  private readonly deps: HeartbeatDeps;
  private config: HeartbeatConfig;
  private running = false;
  private task?: Promise<void>;
  private intervalTimer?: NodeJS.Timeout;

  constructor(params: {
    workspace: string;
    deps: HeartbeatDeps;
    config?: HeartbeatConfig;
  }) {
    this.workspace = params.workspace;
    this.deps = params.deps;
    this.config = params.config ?? {};
  }

  get heartbeatFile(): string {
    return join(this.workspace, "HEARTBEAT.md");
  }

  getConfig(): HeartbeatConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<HeartbeatConfig>) {
    this.config = { ...this.config, ...config };
  }

  private readHeartbeatFile(): string | undefined {
    if (!existsSync(this.heartbeatFile)) return undefined;
    try {
      return readFileSync(this.heartbeatFile, "utf-8");
    } catch {
      return undefined;
    }
  }

  private readLastOkTimestamp(): number | undefined {
    const statePath = join(this.workspace, "memory", "heartbeat-state.json");
    if (!existsSync(statePath)) return undefined;
    try {
      const content = readFileSync(statePath, "utf-8");
      const state = JSON.parse(content);
      return state.last_ok_at;
    } catch {
      return undefined;
    }
  }

  private writeLastOkTimestamp(ts: number): void {
    const statePath = join(this.workspace, "memory", "heartbeat-state.json");
    try {
      const dir = join(this.workspace, "memory");
      writeFileSync(statePath, JSON.stringify({ last_ok_at: ts }, null, 2), "utf-8");
    } catch {
      // ignore
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.emit("heartbeat", "gateway", "alive");

    const handler: () => void = async () => {
      await this.tick();
    };

    const intervalMs = this.config.everyMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.intervalTimer = setInterval(handler, intervalMs);
    this.intervalTimer.unref?.();

    requestHeartbeatNow({ reason: "manual" });
  }

  stop(): void {
    this.running = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
    this.emit("heartbeat", "gateway", "stopped");
  }

  async tick(reason?: string): Promise<string | undefined> {
    const nowMs = this.deps.nowMs?.() ?? Date.now();

    if (!isHeartbeatEnabled(this.config)) {
      this.emit("heartbeat", "gateway", "skipped", "disabled");
      emitHeartbeatEvent({ status: "skipped", reason: "disabled" });
      return undefined;
    }

    if (!isWithinActiveHours(this.config.activeHours, nowMs)) {
      this.emit("heartbeat", "gateway", "skipped", "quiet-hours");
      emitHeartbeatEvent({ status: "skipped", reason: "quiet-hours" });
      return undefined;
    }

    const queueSize = this.deps.getQueueSize?.() ?? 0;
    if (queueSize > 0) {
      this.emit("heartbeat", "gateway", "skipped", "requests-in-flight");
      emitHeartbeatEvent({ status: "skipped", reason: "requests-in-flight" });
      return undefined;
    }

    const content = this.readHeartbeatFile();
    if (isHeartbeatContentEffectivelyEmpty(content)) {
      this.emit("heartbeat", "gateway", "idle");
      this.writeLastOkTimestamp(nowMs);
      emitHeartbeatEvent({ status: "ok-empty", reason: reason });
      return HEARTBEAT_TOKEN;
    }

    this.emit("heartbeat", "gateway", "run");
    const prompt = resolveHeartbeatPrompt(this.config.prompt);

    try {
      const response = await this.deps.processMessage({
        channel: "cli",
        senderId: "heartbeat",
        chatId: "heartbeat",
        content: prompt,
        metadata: { source: "heartbeat", reason },
      });

      const responseContent = response?.content ?? "";
      const visibility = this.resolveVisibility("cli");
      const ackMaxChars = this.config.ackMaxChars ?? DEFAULT_HEARTBEAT_ACK_MAX_CHARS;

      const stripped = stripHeartbeatToken(responseContent, {
        mode: "heartbeat",
        maxAckChars: ackMaxChars,
      });

      if (stripped.shouldSkip) {
        this.emit("heartbeat", "gateway", "done", "HEARTBEAT_OK");
        this.writeLastOkTimestamp(nowMs);

        if (visibility.showOk && this.deps.deliver) {
          await this.deps.deliver(
            { channel: "cli", chatId: "heartbeat" },
            HEARTBEAT_TOKEN,
          );
        }

        emitHeartbeatEvent({
          status: stripped.didStrip ? "ok-token" : "ok-empty",
          reason: reason,
        });
        return HEARTBEAT_TOKEN;
      }

      if (!visibility.showAlerts) {
        this.emit("heartbeat", "gateway", "suppressed", "alerts-disabled");
        this.writeLastOkTimestamp(nowMs);
        emitHeartbeatEvent({ status: "skipped", reason: "alerts-disabled" });
        return HEARTBEAT_TOKEN;
      }

      this.emit("heartbeat", "gateway", "done", stripped.text.slice(0, 100));

      if (this.deps.deliver) {
        await this.deps.deliver(
          { channel: "cli", chatId: "heartbeat" },
          stripped.text,
        );
      }

      emitHeartbeatEvent({ status: "sent", reason: reason });
      return stripped.text;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "unknown";
      this.emit("heartbeat", "gateway", "failed", errMsg);
      emitHeartbeatEvent({ status: "failed", reason: errMsg });
      return undefined;
    }
  }

  private resolveVisibility(channel: string): ResolvedHeartbeatVisibility {
    return resolveHeartbeatVisibility(channel);
  }

  private emit(
    kind: "heartbeat",
    scope: string,
    action: string,
    summary = "",
  ): void {
    console.log(eventLine(kind, scope, action, summary));
  }
}

export function createHeartbeatRunner(params: {
  workspace: string;
  deps: HeartbeatDeps;
  config?: HeartbeatConfig;
}): HeartbeatRunner {
  const runner = new HeartbeatServiceRunner({
    workspace: params.workspace,
    deps: params.deps,
    config: params.config,
  });

  setHeartbeatWakeHandler(async () => {
    await runner.tick();
    return { status: "ran", durationMs: Date.now() };
  });

  return {
    start: () => runner.start(),
    stop: () => runner.stop(),
    tick: () => runner.tick(),
    getConfig: () => runner.getConfig(),
    updateConfig: (config) => runner.updateConfig(config),
  };
}
