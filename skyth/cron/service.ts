import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { CronExpressionParser } from "cron-parser";
import { CronJob, CronPayload, CronSchedule, CronStore } from "./types";

function nowMs(): number {
  return Date.now();
}

function computeNextRun(schedule: CronSchedule, now: number): number | undefined {
  if (schedule.kind === "at") return schedule.at_ms && schedule.at_ms > now ? schedule.at_ms : undefined;
  if (schedule.kind === "every") return schedule.every_ms && schedule.every_ms > 0 ? now + schedule.every_ms : undefined;
  if (schedule.kind === "cron" && schedule.expr) {
    try {
      const interval = CronExpressionParser.parse(schedule.expr, {
        currentDate: new Date(now),
        tz: schedule.tz,
      });
      return interval.next().getTime();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function validateScheduleForAdd(schedule: CronSchedule): void {
  if (schedule.tz && schedule.kind !== "cron") throw new Error("tz can only be used with cron schedules");
  if (schedule.kind === "cron" && schedule.tz) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: schedule.tz });
    } catch {
      throw new Error(`unknown timezone '${schedule.tz}'`);
    }
  }
  if (schedule.kind === "cron" && schedule.expr) {
    try {
      CronExpressionParser.parse(schedule.expr, { tz: schedule.tz });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid cron expression '${schedule.expr}': ${message}`);
    }
  }
}

export class CronService {
  private readonly storePath: string;
  private store?: CronStore;
  private running = false;
  private timerHandle?: ReturnType<typeof setTimeout>;
  private nextWakeAtMs?: number;
  onJob?: (job: CronJob) => Promise<string | null | undefined>;

  constructor(storePath: string) {
    this.storePath = storePath;
  }

  private loadStore(): CronStore {
    if (this.store) return this.store;
    if (existsSync(this.storePath)) {
      try {
        const raw = JSON.parse(readFileSync(this.storePath, "utf-8"));
        this.store = { version: 1, jobs: raw.jobs ?? [] };
        return this.store;
      } catch {
        this.store = { version: 1, jobs: [] };
        return this.store;
      }
    }
    this.store = { version: 1, jobs: [] };
    return this.store;
  }

  private saveStore(): void {
    const store = this.loadStore();
    const parent = dirname(this.storePath);
    mkdirSync(parent, { recursive: true });
    writeFileSync(this.storePath, JSON.stringify(store, null, 2), "utf-8");
  }

  listJobs(includeDisabled = false): CronJob[] {
    const jobs = this.loadStore().jobs;
    return (includeDisabled ? jobs : jobs.filter((j) => j.enabled)).slice().sort((a, b) => {
      const av = a.state.next_run_at_ms ?? Number.MAX_SAFE_INTEGER;
      const bv = b.state.next_run_at_ms ?? Number.MAX_SAFE_INTEGER;
      return av - bv;
    });
  }

  addJob(params: {
    name: string;
    schedule: CronSchedule;
    message: string;
    kind?: CronPayload["kind"];
    deliver?: boolean;
    channel?: string;
    to?: string;
    delete_after_run?: boolean;
  }): CronJob {
    validateScheduleForAdd(params.schedule);
    const store = this.loadStore();
    const now = nowMs();
    const job: CronJob = {
      id: randomUUID().replace(/-/g, "").slice(0, 8),
      name: params.name,
      enabled: true,
      schedule: params.schedule,
      payload: {
        kind: params.kind ?? "agent_turn",
        message: params.message,
        deliver: Boolean(params.deliver),
        channel: params.channel,
        to: params.to,
      },
      state: { next_run_at_ms: computeNextRun(params.schedule, now) },
      created_at_ms: now,
      updated_at_ms: now,
      delete_after_run: Boolean(params.delete_after_run),
    };
    store.jobs.push(job);
    this.saveStore();
    this.armTimer(true);
    return job;
  }

  removeJob(jobId: string): boolean {
    const store = this.loadStore();
    const before = store.jobs.length;
    store.jobs = store.jobs.filter((j) => j.id !== jobId);
    const removed = store.jobs.length < before;
    if (removed) {
      this.saveStore();
      this.armTimer(true);
    }
    return removed;
  }

  enableJob(jobId: string, enabled = true): CronJob | undefined {
    const store = this.loadStore();
    const job = store.jobs.find((j) => j.id === jobId);
    if (!job) return undefined;
    job.enabled = enabled;
    job.updated_at_ms = nowMs();
    job.state.next_run_at_ms = enabled ? computeNextRun(job.schedule, nowMs()) : undefined;
    this.saveStore();
    this.armTimer(true);
    return job;
  }

  async runJob(jobId: string, force = false): Promise<boolean> {
    const store = this.loadStore();
    const job = store.jobs.find((j) => j.id === jobId);
    if (!job) return false;
    if (!force && !job.enabled) return false;

    job.state.last_run_at_ms = nowMs();
    try {
      if (this.onJob) await this.onJob(job);
      job.state.last_status = "ok";
      job.state.last_error = undefined;
      if (job.schedule.kind === "at") {
        if (job.delete_after_run) {
          store.jobs = store.jobs.filter((j) => j.id !== job.id);
        } else {
          job.enabled = false;
          job.state.next_run_at_ms = undefined;
        }
      } else {
        job.state.next_run_at_ms = computeNextRun(job.schedule, nowMs());
      }
      job.updated_at_ms = nowMs();
      this.saveStore();
      return true;
    } catch (error) {
      job.state.last_status = "error";
      job.state.last_error = error instanceof Error ? error.message : String(error);
      job.updated_at_ms = nowMs();
      this.saveStore();
      return false;
    }
  }

  async start(): Promise<void> {
    this.running = true;
    this.recomputeNextRuns();
    this.saveStore();
    this.armTimer();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
  }

  private recomputeNextRuns(): void {
    const store = this.loadStore();
    const now = nowMs();
    for (const job of store.jobs) {
      if (!job.enabled) continue;
      if (job.schedule.kind === "at" && job.state.next_run_at_ms !== undefined) continue;
      job.state.next_run_at_ms = computeNextRun(job.schedule, now);
    }
  }

  private nextWakeMs(): number | undefined {
    const jobs = this.loadStore().jobs;
    const times = jobs
      .filter((job) => job.enabled && job.state.next_run_at_ms !== undefined)
      .map((job) => job.state.next_run_at_ms as number);
    if (!times.length) return undefined;
    return Math.min(...times);
  }

  private clearTimer(): void {
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = undefined;
    }
    this.nextWakeAtMs = undefined;
  }

  private armTimer(force = false): void {
    if (!this.running) return;
    const wakeAt = this.nextWakeMs();
    if (!wakeAt) {
      this.clearTimer();
      return;
    }
    if (!force && this.timerHandle && this.nextWakeAtMs !== undefined && wakeAt >= this.nextWakeAtMs) return;

    this.clearTimer();
    const delay = Math.max(0, wakeAt - nowMs());
    this.nextWakeAtMs = wakeAt;
    this.timerHandle = setTimeout(async () => {
      this.timerHandle = undefined;
      this.nextWakeAtMs = undefined;
      if (!this.running) return;
      await this.onTimer();
      this.armTimer();
    }, delay);
  }

  private async onTimer(): Promise<void> {
    const store = this.loadStore();
    const now = nowMs();
    const due = store.jobs.filter((job) => job.enabled && job.state.next_run_at_ms !== undefined && now >= job.state.next_run_at_ms);
    for (const job of due) {
      await this.executeJob(job);
    }
    this.saveStore();
  }

  private async executeJob(job: CronJob): Promise<void> {
    const startedAt = nowMs();
    job.state.last_run_at_ms = startedAt;
    try {
      if (this.onJob) await this.onJob(job);
      job.state.last_status = "ok";
      job.state.last_error = undefined;
      if (job.schedule.kind === "at") {
        if (job.delete_after_run) {
          const store = this.loadStore();
          store.jobs = store.jobs.filter((item) => item.id !== job.id);
        } else {
          job.enabled = false;
          job.state.next_run_at_ms = undefined;
        }
      } else {
        job.state.next_run_at_ms = computeNextRun(job.schedule, nowMs());
      }
    } catch (error) {
      job.state.last_status = "error";
      job.state.last_error = error instanceof Error ? error.message : String(error);
      job.state.next_run_at_ms = job.schedule.kind === "at" ? undefined : computeNextRun(job.schedule, nowMs());
    } finally {
      job.updated_at_ms = nowMs();
    }
  }

  status(): { enabled: boolean; jobs: number; next_wake_at_ms?: number } {
    const jobs = this.loadStore().jobs;
    const nextTimes = jobs.filter((j) => j.enabled && j.state.next_run_at_ms).map((j) => j.state.next_run_at_ms as number);
    return {
      enabled: true,
      jobs: jobs.length,
      next_wake_at_ms: nextTimes.length ? Math.min(...nextTimes) : undefined,
    };
  }
}
