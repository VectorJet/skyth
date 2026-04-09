import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { CronService } from "../skyth/cron/service";

describe("cron service", () => {
	test("rejects unknown timezone", () => {
		const service = new CronService(
			join(process.cwd(), ".tmp", `cron-${Date.now()}`, "cron", "jobs.json"),
		);
		expect(() =>
			service.addJob({
				name: "tz typo",
				schedule: { kind: "cron", expr: "0 9 * * *", tz: "America/Vancovuer" },
				message: "hello",
			}),
		).toThrow("unknown timezone 'America/Vancovuer'");
		expect(service.listJobs(true)).toEqual([]);
	});

	test("accepts valid timezone", () => {
		const service = new CronService(
			join(process.cwd(), ".tmp", `cron-${Date.now()}`, "cron", "jobs.json"),
		);
		const job = service.addJob({
			name: "tz ok",
			schedule: { kind: "cron", expr: "0 9 * * *", tz: "America/Vancouver" },
			message: "hello",
		});

		expect(job.schedule.tz).toBe("America/Vancouver");
		expect(job.state.next_run_at_ms).toBeDefined();
	});

	test("fires job added after start", async () => {
		const service = new CronService(
			join(process.cwd(), ".tmp", `cron-${Date.now()}`, "cron", "jobs.json"),
		);
		let runs = 0;
		service.onJob = async () => {
			runs += 1;
			return "ok";
		};

		await service.start();
		service.addJob({
			name: "every short",
			schedule: { kind: "every", every_ms: 25 },
			message: "hello",
			deliver: false,
		});

		await new Promise((resolve) => setTimeout(resolve, 80));
		service.stop();
		expect(runs).toBeGreaterThan(0);
	});
});
