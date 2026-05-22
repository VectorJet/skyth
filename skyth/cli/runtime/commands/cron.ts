import { join } from "node:path";
import { CronService } from "@/cron/service";
import { cronAddCommand } from "@/cli/cmd/cron";
import { boolFlag, strFlag } from "@/cli/runtime_helpers";
import { loadConfig, getDataDir } from "@/config/loader";
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
		service.onJob = async (job) => {
			return `queued cron payload: ${job.payload.message ?? job.id}`;
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
