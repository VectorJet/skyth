/**
 * @tool cron
 * @author skyth-team
 * @version 1.0.0
 * @description Schedule reminders and recurring tasks. Actions: add, list, remove.
 * @tags system, schedule
 */
import { defineTool } from "@/sdks/agent-sdk/tools";
import type { CronSchedule } from "@/cron/types";
import type { ToolExecutionContext } from "@/base/base_agent/tools/context";

export default defineTool({
  name: "cron",
  description: "Schedule reminders and recurring tasks. Actions: add, list, remove.",
  parameters: {
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
  },
  async execute(params: Record<string, any>, ctx?: ToolExecutionContext): Promise<string> {
    const action = String(params.action ?? "");

    if (!ctx?.cron) return "Error: Cron service not available";

    if (action === "list") {
      const jobs = ctx.cron.listJobs(true);
      if (!jobs.length) return "No scheduled jobs.";
      return `Scheduled jobs:\n${jobs.map((job) => `- ${job.name} (id: ${job.id}, ${job.schedule.kind})`).join("\n")}`;
    }

    if (action === "remove") {
      const jobId = String(params.job_id ?? "").trim();
      if (!jobId) return "Error: job_id is required for remove";
      return ctx.cron.removeJob(jobId) ? `Removed job ${jobId}` : `Job ${jobId} not found`;
    }

    if (action !== "add") return `Unknown action: ${action}`;

    const message = String(params.message ?? "").trim();
    if (!message) return "Error: message is required for add";
    if (!ctx.channel || !ctx.chatId) return "Error: no session context (channel/chat_id)";

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

    const job = ctx.cron.addJob({
      name: message.slice(0, 30),
      schedule,
      message,
      deliver: true,
      channel: ctx.channel,
      to: ctx.chatId,
      delete_after_run: deleteAfterRun,
    });

    return `Created job '${job.name}' (id: ${job.id})`;
  },
});
