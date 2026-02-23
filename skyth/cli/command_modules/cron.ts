import { join } from "node:path";
import { getWorkspacePath } from "../../utils/helpers";
import { CronService } from "../../cron/service";
import type { CronSchedule } from "../../cron/types";

export function cronAddCommand(args: { name: string; message: string; cron: string; tz?: string }, deps?: { dataDir?: string }): { exitCode: number; output: string } {
  const base = deps?.dataDir ?? join(getWorkspacePath(), "..");
  const service = new CronService(join(base, "cron", "jobs.json"));

  const schedule: CronSchedule = { kind: "cron", expr: args.cron, tz: args.tz };
  try {
    service.addJob({ name: args.name, schedule, message: args.message });
    return { exitCode: 0, output: "Added job" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, output: `Error: ${message}` };
  }
}
