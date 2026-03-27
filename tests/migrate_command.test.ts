import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { migrateCommand } from "../skyth/cli/cmd/migrate";
import { loadConfig, saveConfig } from "../skyth/config/loader";

function setTempHome(tag: string): { home: string; restore: () => void } {
	const previous = process.env.HOME;
	const home = join(process.cwd(), ".tmp", `${tag}-${Date.now()}`);
	mkdirSync(home, { recursive: true });
	process.env.HOME = home;
	return {
		home,
		restore: () => {
			process.env.HOME = previous;
			rmSync(home, { recursive: true, force: true });
		},
	};
}

describe("migrate command", () => {
	test("migrates from openclaw into skyth", async () => {
		const env = setTempHome("migrate-from-openclaw");
		try {
			const openclaw = join(env.home, ".openclaw");
			const openclawWorkspace = join(openclaw, "workspace");
			const openclawSessions = join(openclaw, "agents", "main", "sessions");
			mkdirSync(join(openclawWorkspace, "memory"), { recursive: true });
			mkdirSync(openclawSessions, { recursive: true });
			mkdirSync(join(openclaw, "cron"), { recursive: true });
			mkdirSync(join(openclaw, "credentials"), { recursive: true });

			writeFileSync(
				join(openclawWorkspace, "AGENTS.md"),
				"OpenClaw agent rules",
				"utf-8",
			);
			writeFileSync(
				join(openclawWorkspace, "memory", "2026-02-24.md"),
				"# Daily note",
				"utf-8",
			);
			writeFileSync(
				join(openclawWorkspace, "memory", "heartbeat-state.json"),
				JSON.stringify({ last_ok_at: 123 }, null, 2),
				"utf-8",
			);

			const sessionLines = [
				JSON.stringify({
					type: "session",
					version: 3,
					id: "sess-1",
					timestamp: "2026-02-24T10:00:00.000Z",
					cwd: openclawWorkspace,
				}),
				JSON.stringify({
					type: "message",
					id: "m1",
					parentId: null,
					timestamp: "2026-02-24T10:00:01.000Z",
					message: {
						role: "user",
						content: [{ type: "text", text: "hello from openclaw" }],
						timestamp: 1771927201000,
					},
				}),
			];
			writeFileSync(
				join(openclawSessions, "sess-1.jsonl"),
				`${sessionLines.join("\n")}\n`,
				"utf-8",
			);
			writeFileSync(
				join(openclawSessions, "sessions.json"),
				JSON.stringify(
					{
						"agent:main:main": {
							sessionId: "sess-1",
							deliveryContext: {
								channel: "telegram",
								to: "telegram:7405495226",
							},
						},
					},
					null,
					2,
				),
				"utf-8",
			);

			writeFileSync(
				join(openclaw, "cron", "jobs.json"),
				JSON.stringify(
					{
						version: 1,
						jobs: [
							{
								id: "job-1",
								name: "hourly_ping",
								enabled: true,
								createdAtMs: 1771927200000,
								updatedAtMs: 1771927205000,
								schedule: {
									kind: "every",
									everyMs: 3_600_000,
									anchorMs: 1771927200000,
								},
								payload: { kind: "systemEvent", text: "ping" },
								state: { nextRunAtMs: 1771930800000, lastStatus: "ok" },
							},
						],
					},
					null,
					2,
				),
				"utf-8",
			);

			writeFileSync(
				join(openclaw, "credentials", "telegram-allowFrom.json"),
				JSON.stringify(
					{
						version: 1,
						allowFrom: ["7405495226"],
					},
					null,
					2,
				),
				"utf-8",
			);

			writeFileSync(
				join(openclaw, "openclaw.json"),
				JSON.stringify(
					{
						agents: {
							defaults: {
								model: { primary: "google/gemini-2.5-pro" },
								workspace: openclawWorkspace,
							},
						},
						channels: {
							telegram: {
								enabled: true,
								botToken: "12345:token",
							},
						},
					},
					null,
					2,
				),
				"utf-8",
			);

			const result = await migrateCommand({
				direction: "from",
				target: "openclaw",
			});
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("Migration complete: openclaw -> skyth");

			const skythWorkspace = join(env.home, ".skyth", "workspace");
			expect(existsSync(join(skythWorkspace, "AGENTS.md"))).toBeTrue();
			expect(
				existsSync(join(skythWorkspace, "memory", "daily", "2026-02-24.md")),
			).toBeTrue();
			expect(
				existsSync(join(skythWorkspace, "memory", "heartbeat-state.json")),
			).toBeTrue();

			const migratedSession = join(
				skythWorkspace,
				"sessions",
				"telegram_7405495226.jsonl",
			);
			expect(existsSync(migratedSession)).toBeTrue();
			const sessionRows = readFileSync(migratedSession, "utf-8")
				.trim()
				.split("\n");
			const metadata = JSON.parse(sessionRows[0]!);
			expect(metadata._type).toBe("metadata");
			expect(metadata.key).toBe("telegram:7405495226");

			const cronStore = JSON.parse(
				readFileSync(join(env.home, ".skyth", "cron", "jobs.json"), "utf-8"),
			);
			expect(cronStore.jobs[0].schedule.every_ms).toBe(3_600_000);
			expect(cronStore.jobs[0].payload.message).toBe("ping");

			const telegramCfg = JSON.parse(
				readFileSync(
					join(env.home, ".skyth", "channels", "telegram.json"),
					"utf-8",
				),
			);
			expect(telegramCfg.allow_from).toEqual(["7405495226"]);
			expect(telegramCfg.token).toBe("[redacted]");
		} finally {
			env.restore();
		}
	});

	test("migrates from skyth into openclaw", async () => {
		const env = setTempHome("migrate-to-openclaw");
		try {
			const skyth = join(env.home, ".skyth");
			const skythWorkspace = join(skyth, "workspace");
			mkdirSync(join(skythWorkspace, "memory", "daily"), { recursive: true });
			mkdirSync(join(skythWorkspace, "sessions"), { recursive: true });
			mkdirSync(join(skyth, "cron"), { recursive: true });

			const cfg = loadConfig();
			cfg.primary_model = "groq/moonshotai/kimi-k2-instruct-0905";
			cfg.agents.defaults.model = "groq/moonshotai/kimi-k2-instruct-0905";
			cfg.channels.telegram.enabled = true;
			cfg.channels.telegram.token = "99999:telegram-token";
			cfg.channels.telegram.allow_from = ["7405495226"];
			saveConfig(cfg);

			writeFileSync(
				join(skythWorkspace, "AGENTS.md"),
				"Skyth agent rules",
				"utf-8",
			);
			writeFileSync(
				join(skythWorkspace, "memory", "daily", "2026-02-25.md"),
				"# Skyth day",
				"utf-8",
			);
			writeFileSync(
				join(skythWorkspace, "memory", "heartbeat-state.json"),
				JSON.stringify({ last_ok_at: 456 }, null, 2),
				"utf-8",
			);
			writeFileSync(
				join(skythWorkspace, "sessions", "telegram_7405495226.jsonl"),
				[
					JSON.stringify({
						_type: "metadata",
						key: "telegram:7405495226",
						created_at: "2026-02-25T08:00:00.000Z",
						updated_at: "2026-02-25T08:01:00.000Z",
						metadata: {},
						last_consolidated: 0,
					}),
					JSON.stringify({
						role: "user",
						content: "hello skyth",
						timestamp: "2026-02-25T08:00:30.000Z",
					}),
				].join("\n") + "\n",
				"utf-8",
			);

			writeFileSync(
				join(skyth, "cron", "jobs.json"),
				JSON.stringify(
					{
						version: 1,
						jobs: [
							{
								id: "cron-1",
								name: "daily_summary_nightly",
								enabled: true,
								schedule: { kind: "cron", expr: "55 23 * * *", tz: "UTC" },
								payload: {
									kind: "daily_summary",
									message: "2026-02-25",
									deliver: false,
								},
								state: { next_run_at_ms: 1772063700000, last_status: "ok" },
								created_at_ms: 1771977600000,
								updated_at_ms: 1771977605000,
								delete_after_run: false,
							},
						],
					},
					null,
					2,
				),
				"utf-8",
			);

			mkdirSync(join(env.home, ".openclaw"), { recursive: true });
			writeFileSync(
				join(env.home, ".openclaw", "openclaw.json"),
				JSON.stringify(
					{
						channels: { telegram: {} },
						agents: { defaults: { model: { primary: "" } } },
					},
					null,
					2,
				),
				"utf-8",
			);

			const result = await migrateCommand({
				direction: "to",
				target: "openclaw",
			});
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain("Migration complete: skyth -> openclaw");

			const openclawWorkspace = join(env.home, ".openclaw", "workspace");
			expect(existsSync(join(openclawWorkspace, "AGENTS.md"))).toBeTrue();
			expect(
				existsSync(join(openclawWorkspace, "memory", "2026-02-25.md")),
			).toBeTrue();
			expect(
				existsSync(join(openclawWorkspace, "memory", "heartbeat-state.json")),
			).toBeTrue();

			const openclawCron = JSON.parse(
				readFileSync(join(env.home, ".openclaw", "cron", "jobs.json"), "utf-8"),
			);
			expect(openclawCron.jobs[0].schedule.expr).toBe("55 23 * * *");
			expect(openclawCron.jobs[0].payload.kind).toBe("systemEvent");

			const allow = JSON.parse(
				readFileSync(
					join(env.home, ".openclaw", "credentials", "telegram-allowFrom.json"),
					"utf-8",
				),
			);
			expect(allow.allowFrom).toEqual(["7405495226"]);

			const ocCfg = JSON.parse(
				readFileSync(join(env.home, ".openclaw", "openclaw.json"), "utf-8"),
			);
			expect(ocCfg.channels.telegram.botToken).toBe("99999:telegram-token");
			expect(ocCfg.agents.defaults.model.primary).toBe(
				"groq/moonshotai/kimi-k2-instruct-0905",
			);

			const sessionsDir = join(
				env.home,
				".openclaw",
				"agents",
				"main",
				"sessions",
			);
			const created = readdirSync(sessionsDir).filter((file) =>
				file.endsWith(".jsonl"),
			);
			expect(created.length).toBeGreaterThan(0);
		} finally {
			env.restore();
		}
	});
});
