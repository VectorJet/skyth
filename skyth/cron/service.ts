import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { CronJob, CronSchedule, CronStore } from "./types";

function nowMs(): number {
  return Date.now();
}

function computeNextRun(schedule: CronSchedule, now: number): number | undefined {
  if (schedule.kind === "at") return schedule.at_ms && schedule.at_ms > now ? schedule.at_ms : undefined;
  if (schedule.kind === "every") return schedule.every_ms && schedule.every_ms > 0 ? now + schedule.every_ms : undefined;
  if (schedule.kind === "cron" && schedule.expr) {
    return now + 60_000;
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
}

export class CronService {
  private readonly storePath: string;
  private store?: CronStore;
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

  addJob(params: { name: string; schedule: CronSchedule; message: string; deliver?: boolean; channel?: string; to?: string; delete_after_run?: boolean; }): CronJob {
    validateScheduleForAdd(params.schedule);
    const store = this.loadStore();
    const now = nowMs();
    const job: CronJob = {
      id: randomUUID().replace(/-/g, "").slice(0, 8),
      name: params.name,
      enabled: true,
      schedule: params.schedule,
      payload: {
        kind: "agent_turn",
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
    return job;
  }

  removeJob(jobId: string): boolean {
    const store = this.loadStore();
    const before = store.jobs.length;
    store.jobs = store.jobs.filter((j) => j.id !== jobId);
    const removed = store.jobs.length < before;
    if (removed) this.saveStore();
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
