import { randomBytes } from "node:crypto";
import { writeJson, readJson } from "./utils";

function mapOpenClawKindToSkyth(
	kind: unknown,
): "system_event" | "agent_turn" | "daily_summary" {
	const value = String(kind ?? "")
		.trim()
		.toLowerCase();
	if (value === "daily_summary" || value === "dailysummary")
		return "daily_summary";
	if (value === "agent_turn" || value === "agentturn") return "agent_turn";
	return "system_event";
}

function mapSkythKindToOpenClaw(kind: unknown): "systemEvent" | "agentTurn" {
	const value = String(kind ?? "")
		.trim()
		.toLowerCase();
	if (value === "agent_turn" || value === "agentturn") return "agentTurn";
	return "systemEvent";
}

export function convertOpenClawCronJobs(
	sourcePath: string,
	targetPath: string,
): number {
	const source = readJson<{
		version?: number;
		jobs?: Array<Record<string, any>>;
	}>(sourcePath, { version: 1, jobs: [] });
	const jobs = Array.isArray(source.jobs) ? source.jobs : [];
	const migrated = jobs.map((job) => {
		const schedule = job.schedule ?? {};
		const kind = String(schedule.kind ?? "every");
		const mappedSchedule: Record<string, unknown> = { kind };
		if (kind === "every")
			mappedSchedule.every_ms = Number(
				schedule.everyMs ?? schedule.every_ms ?? 0,
			);
		if (kind === "cron") {
			mappedSchedule.expr = String(schedule.expr ?? "");
			if (schedule.tz) mappedSchedule.tz = String(schedule.tz);
		}
		if (kind === "at") {
			const atRaw = schedule.at ?? schedule.atMs ?? schedule.at_ms;
			const atMs =
				typeof atRaw === "number"
					? atRaw
					: Number(new Date(String(atRaw)).getTime());
			if (Number.isFinite(atMs)) mappedSchedule.at_ms = atMs;
		}

		return {
			id: String(job.id ?? randomBytes(4).toString("hex")),
			name: String(job.name ?? "migrated_job"),
			enabled: Boolean(job.enabled ?? true),
			schedule: mappedSchedule,
			payload: {
				kind: mapOpenClawKindToSkyth(job.payload?.kind),
				message: String(job.payload?.text ?? job.payload?.message ?? ""),
				deliver: false,
			},
			state: {
				next_run_at_ms: Number(job.state?.nextRunAtMs ?? 0) || undefined,
				last_run_at_ms: Number(job.state?.lastRunAtMs ?? 0) || undefined,
				last_status:
					String(job.state?.lastStatus ?? "").toLowerCase() === "error"
						? "error"
						: String(job.state?.lastStatus ?? "").toLowerCase() === "skipped"
							? "skipped"
							: "ok",
				last_error: job.state?.lastError
					? String(job.state.lastError)
					: undefined,
			},
			created_at_ms: Number(job.createdAtMs ?? Date.now()),
			updated_at_ms: Number(job.updatedAtMs ?? Date.now()),
			delete_after_run: Boolean(job.deleteAfterRun ?? job.delete_after_run),
		};
	});

	writeJson(targetPath, { version: 1, jobs: migrated });
	return migrated.length;
}

export function convertSkythCronJobs(
	sourcePath: string,
	targetPath: string,
): number {
	const source = readJson<{
		version?: number;
		jobs?: Array<Record<string, any>>;
	}>(sourcePath, { version: 1, jobs: [] });
	const jobs = Array.isArray(source.jobs) ? source.jobs : [];
	const migrated = jobs.map((job) => {
		const schedule = job.schedule ?? {};
		const kind = String(schedule.kind ?? "every");
		const mappedSchedule: Record<string, unknown> = { kind };
		if (kind === "every") {
			const everyMs = Number(schedule.every_ms ?? schedule.everyMs ?? 0);
			mappedSchedule.everyMs = everyMs;
			mappedSchedule.anchorMs = Number(job.created_at_ms ?? Date.now());
		}
		if (kind === "cron") {
			mappedSchedule.expr = String(schedule.expr ?? "");
			if (schedule.tz) mappedSchedule.tz = String(schedule.tz);
		}
		if (kind === "at") {
			const atMs = Number(schedule.at_ms ?? schedule.atMs ?? 0);
			if (Number.isFinite(atMs) && atMs > 0)
				mappedSchedule.at = new Date(atMs).toISOString();
		}

		const lastStatus = String(job.state?.last_status ?? "ok");
		return {
			id: String(job.id ?? randomBytes(16).toString("hex")),
			agentId: "main",
			name: String(job.name ?? "migrated_job"),
			enabled: Boolean(job.enabled ?? true),
			createdAtMs: Number(job.created_at_ms ?? Date.now()),
			updatedAtMs: Number(job.updated_at_ms ?? Date.now()),
			schedule: mappedSchedule,
			sessionTarget: "main",
			wakeMode: "next-heartbeat",
			payload: {
				kind: mapSkythKindToOpenClaw(job.payload?.kind),
				text: String(job.payload?.message ?? ""),
			},
			state: {
				nextRunAtMs: Number(job.state?.next_run_at_ms ?? 0) || undefined,
				lastRunAtMs: Number(job.state?.last_run_at_ms ?? 0) || undefined,
				lastStatus,
				lastError: job.state?.last_error
					? String(job.state.last_error)
					: undefined,
				consecutiveErrors: lastStatus === "error" ? 1 : 0,
			},
			deleteAfterRun: Boolean(job.delete_after_run),
		};
	});

	writeJson(targetPath, { version: 1, jobs: migrated });
	return migrated.length;
}
