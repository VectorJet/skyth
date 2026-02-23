import type { CronSchedule } from "../../../cron/types";
import { CronService } from "../../../cron/service";
import { Tool } from "./base";

export class CronTool extends Tool {
  private channel = "";
  private chatId = "";

  constructor(private readonly cron: CronService) {
    super();
  }

  setContext(channel: string, chatId: string): void {
    this.channel = channel;
    this.chatId = chatId;
  }

  get name(): string { return "cron"; }
  get description(): string { return "Schedule reminders and recurring tasks. Actions: add, list, remove."; }
  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "list", "remove"] },
        message: { type: "string" },
        every_seconds: { type: "integer" },
        cron_expr: { type: "string" },
        tz: { type: "string" },
        at: { type: "string" },
        job_id: { type: "string" },
      },
      required: ["action"],
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const action = String(params.action ?? "");
    if (action === "list") {
      const jobs = this.cron.listJobs(true);
      if (!jobs.length) return "No scheduled jobs.";
      return `Scheduled jobs:\n${jobs.map((job) => `- ${job.name} (id: ${job.id}, ${job.schedule.kind})`).join("\n")}`;
    }

    if (action === "remove") {
      const jobId = String(params.job_id ?? "").trim();
      if (!jobId) return "Error: job_id is required for remove";
      return this.cron.removeJob(jobId) ? `Removed job ${jobId}` : `Job ${jobId} not found`;
    }

    if (action !== "add") return `Unknown action: ${action}`;

    const message = String(params.message ?? "").trim();
    if (!message) return "Error: message is required for add";
    if (!this.channel || !this.chatId) return "Error: no session context (channel/chat_id)";

    let schedule: CronSchedule | undefined;
    let deleteAfterRun = false;

    const everySeconds = Number(params.every_seconds ?? 0);
    const cronExpr = String(params.cron_expr ?? "").trim();
    const at = String(params.at ?? "").trim();
    const tz = String(params.tz ?? "").trim();

    if (everySeconds > 0) {
      schedule = { kind: "every", every_ms: everySeconds * 1000 };
    } else if (cronExpr) {
      schedule = { kind: "cron", expr: cronExpr, tz: tz || undefined };
    } else if (at) {
      const when = Date.parse(at);
      if (Number.isNaN(when)) return "Error: invalid at datetime";
      schedule = { kind: "at", at_ms: when };
      deleteAfterRun = true;
    }

    if (!schedule) return "Error: either every_seconds, cron_expr, or at is required";

    const job = this.cron.addJob({
      name: message.slice(0, 30),
      schedule,
      message,
      deliver: true,
      channel: this.channel,
      to: this.chatId,
      delete_after_run: deleteAfterRun,
    });

    return `Created job '${job.name}' (id: ${job.id})`;
  }
}
