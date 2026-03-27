import { join } from "node:path";
import { CronService } from "@/cron/service";
import { MessageBus } from "@/bus/queue";
import { AgentLoop } from "@/base/base_agent/runtime";
import { cronAddCommand } from "@/cli/cmd/cron";
import {
	boolFlag,
	makeProviderFromConfig,
	strFlag,
} from "@/cli/runtime_helpers";
import { loadConfig, getDataDir } from "@/config/loader";
import { MemoryStore } from "@/base/base_agent/memory/store";
import type { CommandContext, CommandHandler } from "@/cli/runtime/types";

function localDate(tsMs = Date.now()): string {
	const d = new Date(tsMs);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export const cronHandler: CommandHandler = async ({
	positionals,
	flags,
}: CommandContext): Promise<number> => {
	if (positionals[1] === "add") {
		const name = strFlag(flags, "name");
		const message = strFlag(flags, "message");
		const cron = strFlag(flags, "cron");
		const tz = strFlag(flags, "tz");
		if (!name || !message || !cron) {
			console.error("Error: --name, --message, and --cron are required");
			return 1;
		}
		const result = cronAddCommand(
			{ name, message, cron, tz },
			{ dataDir: join(getDataDir(), "") },
		);
		console.log(result.output);
		return result.exitCode;
	}

	const sub = positionals[1];
	const store = join(getDataDir(), "cron", "jobs.json");
	const service = new CronService(store);
	if (!sub || sub === "help" || boolFlag(flags, "help")) {
		console.log(
			[
				"Usage: skyth cron COMMAND [ARGS]...",
				"",
				"Commands:",
				"  list",
				"  add",
				"  remove",
				"  enable",
				"  run",
			].join("\n"),
		);
		return 0;
	}
	if (sub === "list") {
		const all = boolFlag(flags, "all", false);
		const jobs = service.listJobs(all);
		if (!jobs.length) {
			console.log("No scheduled jobs.");
			return 0;
		}
		for (const j of jobs) {
			const sched =
				j.schedule.kind === "every"
					? `every ${(j.schedule.every_ms ?? 0) / 1000}s`
					: j.schedule.kind === "cron"
						? `${j.schedule.expr ?? ""}${j.schedule.tz ? ` (${j.schedule.tz})` : ""}`
						: "one-time";
			const status = j.enabled ? "enabled" : "disabled";
			const next = j.state.next_run_at_ms
				? new Date(j.state.next_run_at_ms).toISOString()
				: "-";
			console.log(`${j.id}\t${j.name}\t${sched}\t${status}\t${next}`);
		}
		return 0;
	}

	if (sub === "remove") {
		const jobId = positionals[2];
		if (!jobId) {
			console.error("Error: job id is required");
			return 1;
		}
		if (service.removeJob(jobId)) {
			console.log(`Removed job ${jobId}`);
			return 0;
		}
		console.error(`Job ${jobId} not found`);
		return 1;
	}

	if (sub === "enable") {
		const jobId = positionals[2];
		if (!jobId) {
			console.error("Error: job id is required");
			return 1;
		}
		const enabled = !boolFlag(flags, "disable", false);
		const job = service.enableJob(jobId, enabled);
		if (!job) {
			console.error(`Job ${jobId} not found`);
			return 1;
		}
		console.log(`${enabled ? "Enabled" : "Disabled"} job ${jobId}`);
		return 0;
	}

	if (sub === "run") {
		const jobId = positionals[2];
		if (!jobId) {
			console.error("Error: job id is required");
			return 1;
		}
		const model = strFlag(flags, "model") ?? loadConfig().agents.defaults.model;
		const provider = makeProviderFromConfig(model);
		const bus = new MessageBus();
		const cfg = loadConfig();
		const routerModel =
			String(
				(cfg.session_graph as Record<string, unknown>)?.router_model ?? "",
			).trim() || (cfg.use_router ? String(cfg.router_model ?? "").trim() : "");
		const memory = new MemoryStore(cfg.workspace_path);
		const agent = new AgentLoop({
			bus,
			provider,
			workspace: cfg.workspace_path,
			model,
			temperature: cfg.agents.defaults.temperature,
			max_tokens: cfg.agents.defaults.max_tokens,
			max_iterations: cfg.agents.defaults.max_tool_iterations,
			steps: cfg.agents.defaults.steps,
			memory_window: cfg.agents.defaults.memory_window,
			exec_timeout: cfg.tools.exec.timeout,
			restrict_to_workspace: cfg.tools.restrict_to_workspace,
			router_model: routerModel || undefined,
			session_graph_config: cfg.session_graph,
		});
		service.onJob = async (job) => {
			if (job.payload.kind === "daily_summary") {
				const requestedDate = String(job.payload.message ?? "").trim();
				const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
					? requestedDate
					: localDate();
				const summary = memory.writeDailySummary(date);
				memory.recordEvent({
					kind: "cron",
					scope: "memory",
					action: "daily",
					summary: date,
					details: { path: summary.path, events: summary.eventCount },
				});
				return `daily summary: ${summary.path}`;
			}
			const response = await agent.processMessage(
				{
					channel: job.payload.channel || "cli",
					senderId: "cron",
					chatId: job.payload.to || "cron",
					content: job.payload.message,
					metadata: { source: "cron", cron_job_id: job.id },
				},
				`cron:${job.id}`,
			);
			return response?.content;
		};

		const ok = await service.runJob(jobId, true);
		if (ok) {
			console.log(`Ran job ${jobId}`);
			return 0;
		}
		console.error(`Failed to run job ${jobId}`);
		return 1;
	}

	console.error(`Error: unknown cron command '${sub}'`);
	return 1;
};
