import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { writeSuperuserPasswordRecord } from "../skyth/auth/superuser";
import { ReadFileTool } from "../skyth/base/base_agent/tools/filesystem";
import { MemoryStore } from "../skyth/base/base_agent/memory/store";

function makeDir(prefix: string): string {
	const path = join(tmpdir(), `${prefix}-${randomUUID()}`);
	mkdirSync(path, { recursive: true });
	return path;
}

describe("memory runtime", () => {
	test("locked files require valid superuser password", async () => {
		const fakeHome = makeDir("skyth-home");
		const workspace = makeDir("skyth-workspace");
		const oldHome = process.env.HOME;
		process.env.HOME = fakeHome;

		try {
			await writeSuperuserPasswordRecord("S3cur3P@ssw0rd!");
			const locked = join(workspace, "memory", "MENTAL_IMAGE.locked.md");
			mkdirSync(join(workspace, "memory"), { recursive: true });
			writeFileSync(locked, "private", "utf-8");

			const tool = new ReadFileTool(workspace, workspace);
			const missing = await tool.execute({ path: locked });
			expect(missing).toContain("superuser_password is required");

			const wrong = await tool.execute({
				path: locked,
				superuser_password: "wrong",
			});
			expect(wrong).toContain("invalid superuser_password");

			const ok = await tool.execute({
				path: locked,
				superuser_password: "S3cur3P@ssw0rd!",
			});
			expect(ok).toBe("private");
		} finally {
			process.env.HOME = oldHome;
		}
	});

	test("memory store writes daily summary and session primer", () => {
		const workspace = makeDir("skyth-memory");
		const sessionsDir = join(workspace, "sessions");
		mkdirSync(sessionsDir, { recursive: true });

		const sessionFile = join(sessionsDir, "cli_direct.jsonl");
		const lines = [
			JSON.stringify({ _type: "metadata", key: "cli:direct" }),
			JSON.stringify({ role: "user", content: "Call me T" }),
			JSON.stringify({ role: "assistant", content: "Got it." }),
		];
		writeFileSync(sessionFile, `${lines.join("\n")}\n`, "utf-8");

		const memory = new MemoryStore(workspace);
		const ts = new Date("2026-02-24T10:30:00Z").getTime();
		memory.recordEvent({
			kind: "event",
			scope: "agent",
			action: "send",
			summary: "hello",
			timestamp_ms: ts,
		});
		memory.recordEvent({
			kind: "event",
			scope: "telegram",
			action: "receive",
			summary: "yo",
			timestamp_ms: ts + 1,
		});

		const primer = memory.getSessionPrimer("cli:direct", 4);
		expect(primer).toContain("Session Primer");
		expect(primer).toContain("user: Call me T");

		const summary = memory.writeDailySummary("2026-02-24");
		expect(existsSync(summary.path)).toBeTrue();
		const raw = readFileSync(summary.path, "utf-8");
		expect(raw).toContain("Total events: 2");
		expect(raw).toContain("[event][agent]");
	});

	test("session primer does not bleed across unrelated sessions", () => {
		const workspace = makeDir("skyth-memory-isolation");
		const sessionsDir = join(workspace, "sessions");
		mkdirSync(sessionsDir, { recursive: true });

		const otherSession = join(sessionsDir, "telegram_other.jsonl");
		const lines = [
			JSON.stringify({ _type: "metadata", key: "telegram:other" }),
			JSON.stringify({
				role: "user",
				content: "Old context should stay isolated",
			}),
		];
		writeFileSync(otherSession, `${lines.join("\n")}\n`, "utf-8");

		const memory = new MemoryStore(workspace);
		const primer = memory.getSessionPrimer("cli:direct", 4);
		expect(primer).toBe("");
	});
});
