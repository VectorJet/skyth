import { join } from "node:path";
import { getWorkspacePath } from "../../../utils/helpers";
import { CronService } from "../../../cron/service";
import type { CronSchedule } from "../../../cron/types";
import type { CronAddArgs, CronDeps } from "./types";

export function cronAddCommand(args: CronAddArgs, deps?: CronDeps): { exitCode: number; output: string } {
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
