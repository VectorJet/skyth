import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { SKYTH_HOME } from "@/gateway/config/env.ts";

const DAEMON_LOG = join(SKYTH_HOME, "quasar.log");
let daemonStartPromise: Promise<void> | null = null;

function repoRoot(): string {
	return join(import.meta.dir, "..", "..");
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeSocket(socketPath: string, timeoutMs: number): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const socket = createConnection(socketPath);
		const timer = setTimeout(() => {
			socket.destroy();
			reject(new Error("probe timed out"));
		}, timeoutMs);
		socket.once("connect", () => {
			clearTimeout(timer);
			socket.end();
			resolve();
		});
		socket.once("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}

async function waitForSocket(socketPath: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			await probeSocket(socketPath, 250);
			return;
		} catch (error) {
			lastError = error;
			await wait(100);
		}
	}
	const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
	throw new Error(
		`quasar daemon did not start at ${socketPath}${detail}. See ${DAEMON_LOG}`,
	);
}

export async function ensureQuasarDaemon(socketPath: string): Promise<void> {
	if (process.env.SKYTH_QUASAR_AUTOSTART === "0") return;
	if (daemonStartPromise) return daemonStartPromise;

	daemonStartPromise = (async () => {
		mkdirSync(SKYTH_HOME, { recursive: true });
		const logFd = openSync(DAEMON_LOG, "a");
		const child = spawn(
			"cargo",
			["run", "--manifest-path", "quasar/Cargo.toml"],
			{
				cwd: repoRoot(),
				detached: true,
				stdio: ["ignore", logFd, logFd],
				env: { ...process.env, SKYTH_HOME },
			},
		);
		child.unref();
		closeSync(logFd);
		await waitForSocket(socketPath, 60_000);
	})();

	try {
		await daemonStartPromise;
	} finally {
		daemonStartPromise = null;
	}
}
