import type { GatewayClient } from "@/gateway/protocol";
import type { CronService } from "@/cron/service";
import type { CronJob, CronSchedule, CronPayload } from "@/cron/types";

export interface CronHandlerDeps {
	cronService: CronService;
	getAuthenticatedNode: (client: GatewayClient) => {
		node_id: string;
		channel: string;
		sender_id: string;
	} | null;
}

export interface CronStatusResult {
	enabled: boolean;
	jobs: number;
	next_wake_at_ms?: number;
}

export interface CronJobEntry {
	id: string;
	name: string;
	enabled: boolean;
	schedule: CronSchedule;
	payload: CronPayload;
	state: {
		next_run_at_ms?: number;
		last_run_at_ms?: number;
		last_status?: string;
		last_error?: string;
	};
	created_at_ms: number;
	updated_at_ms: number;
	delete_after_run: boolean;
}

export interface CronJobsListResult {
	jobs: CronJobEntry[];
	total: number;
}

export interface CronJobsGetResult {
	job: CronJobEntry;
}

export interface CronJobsSetResult {
	ok: boolean;
	job?: CronJobEntry;
	error?: string;
}

export interface CronJobsDeleteResult {
	ok: boolean;
	deleted: boolean;
}

export interface CronRunsListResult {
	runs: Array<{
		job_id: string;
		job_name: string;
		run_at_ms: number;
		status: string;
		error?: string;
	}>;
	total: number;
}

function mapJobToEntry(job: CronJob): CronJobEntry {
	return {
		id: job.id,
		name: job.name,
		enabled: job.enabled,
		schedule: job.schedule,
		payload: job.payload,
		state: {
			next_run_at_ms: job.state.next_run_at_ms,
			last_run_at_ms: job.state.last_run_at_ms,
			last_status: job.state.last_status,
			last_error: job.state.last_error,
		},
		created_at_ms: job.created_at_ms,
		updated_at_ms: job.updated_at_ms,
		delete_after_run: job.delete_after_run,
	};
}

export function createCronHandlers(deps: CronHandlerDeps) {
	const { cronService, getAuthenticatedNode } = deps;

	return {
		"cron.status": async (
			_method: string,
			_params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const status = cronService.status();

			return {
				enabled: status.enabled,
				jobs: status.jobs,
				next_wake_at_ms: status.next_wake_at_ms,
			} as CronStatusResult;
		},

		"cron.jobs.list": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as { include_disabled?: boolean; limit?: number; offset?: number } | undefined;
			const includeDisabled = p?.include_disabled ?? false;
			const jobs = cronService.listJobs(includeDisabled);

			const offset = p?.offset ?? 0;
			const limit = Math.min(p?.limit ?? 50, 200);
			const paginatedJobs = jobs.slice(offset, offset + limit);

			return {
				jobs: paginatedJobs.map(mapJobToEntry),
				total: jobs.length,
			} as CronJobsListResult;
		},

		"cron.jobs.get": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as { job_id?: string } | undefined;
			const jobId = p?.job_id;

			if (!jobId) {
				throw new Error("job_id is required");
			}

			const jobs = cronService.listJobs(true);
			const job = jobs.find((j) => j.id === jobId);

			if (!job) {
				throw new Error(`job "${jobId}" not found`);
			}

			return {
				job: mapJobToEntry(job),
			} as CronJobsGetResult;
		},

		"cron.jobs.set": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as {
				name?: string;
				schedule?: CronSchedule;
				message?: string;
				kind?: CronPayload["kind"];
				deliver?: boolean;
				channel?: string;
				to?: string;
				delete_after_run?: boolean;
			} | undefined;

			const name = p?.name;
			const schedule = p?.schedule;
			const message = p?.message;

			if (!name) {
				throw new Error("name is required");
			}
			if (!schedule) {
				throw new Error("schedule is required");
			}
			if (!message) {
				throw new Error("message is required");
			}

			try {
				const job = cronService.addJob({
					name,
					schedule,
					message,
					kind: p.kind,
					deliver: p.deliver,
					channel: p.channel,
					to: p.to,
					delete_after_run: p.delete_after_run,
				});

				return {
					ok: true,
					job: mapJobToEntry(job),
				} as CronJobsSetResult;
			} catch (error) {
				return {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				} as CronJobsSetResult;
			}
		},

		"cron.jobs.delete": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as { job_id?: string } | undefined;
			const jobId = p?.job_id;

			if (!jobId) {
				throw new Error("job_id is required");
			}

			const deleted = cronService.removeJob(jobId);

			return {
				ok: true,
				deleted,
			} as CronJobsDeleteResult;
		},

		"cron.runs.list": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as { job_id?: string; limit?: number; offset?: number } | undefined;

			const jobs = cronService.listJobs(true);
			const runs: Array<{
				job_id: string;
				job_name: string;
				run_at_ms: number;
				status: string;
				error?: string;
			}> = [];

			// Get runs from jobs that have run history
			const filteredJobs = p?.job_id
				? jobs.filter((j) => j.id === p.job_id)
				: jobs;

			for (const job of filteredJobs) {
				if (job.state.last_run_at_ms) {
					runs.push({
						job_id: job.id,
						job_name: job.name,
						run_at_ms: job.state.last_run_at_ms,
						status: job.state.last_status ?? "unknown",
						error: job.state.last_error,
					});
				}
			}

			// Sort by run time descending
			runs.sort((a, b) => b.run_at_ms - a.run_at_ms);

			const offset = p?.offset ?? 0;
			const limit = Math.min(p?.limit ?? 50, 200);
			const paginatedRuns = runs.slice(offset, offset + limit);

			return {
				runs: paginatedRuns,
				total: runs.length,
			} as CronRunsListResult;
		},
	};
}