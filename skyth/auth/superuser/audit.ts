import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAuditLogPath, getVerifyAttemptsPath, authRoot, superuserHashesDir } from "./paths";
import { RATE_LIMIT_WINDOW_MS, MAX_VERIFY_ATTEMPTS } from "./constants";
import type { VerifyAttempt } from "./types";

export function logAuditEvent(
	event: { action: string; success: boolean; details?: string },
	overrideAuthDir?: string,
): void {
	try {
		ensureAuthPaths(overrideAuthDir);
		const logPath = getAuditLogPath(overrideAuthDir);
		const entry = {
			timestamp: new Date().toISOString(),
			...event,
		};
		appendFileSync(logPath, `${JSON.stringify(entry)}\n`, {
			encoding: "utf-8",
			mode: 0o600,
		});
	} catch {
		console.error(
			"Failed to write audit log - security event may not be recorded.",
		);
	}
}

export function getVerifyAttempts(overrideAuthDir?: string): VerifyAttempt[] {
	const path = getVerifyAttemptsPath(overrideAuthDir);
	if (!existsSync(path)) return [];

	try {
		const raw = readFileSync(path, "utf-8");
		return raw
			.split("\n")
			.filter((line) => line.trim().length > 0)
			.map((line) => JSON.parse(line) as VerifyAttempt);
	} catch {
		return [];
	}
}

export function addVerifyAttempt(success: boolean, overrideAuthDir?: string): void {
	try {
		ensureAuthPaths(overrideAuthDir);
		const path = getVerifyAttemptsPath(overrideAuthDir);
		const entry: VerifyAttempt = { timestamp: Date.now(), success };
		appendFileSync(path, `${JSON.stringify(entry)}\n`, {
			encoding: "utf-8",
			mode: 0o600,
		});
	} catch {
		console.error("Failed to record verify attempt.");
	}
}

export function isRateLimited(overrideAuthDir?: string): boolean {
	const attempts = getVerifyAttempts(overrideAuthDir);
	const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS;
	const recentAttempts = attempts.filter(
		(a) => a.timestamp > windowStart && !a.success,
	);
	return recentAttempts.length >= MAX_VERIFY_ATTEMPTS;
}

export function ensureAuthPaths(overrideAuthDir?: string): void {
	const root = authRoot(overrideAuthDir);
	mkdirSync(root, { recursive: true, mode: 0o700 });
	try {
		chmodSync(root, 0o700);
	} catch {
		// Best effort permissions tightening.
	}

	const superuserDir = join(root, "superuser");
	mkdirSync(superuserDir, { recursive: true, mode: 0o700 });
	try {
		chmodSync(superuserDir, 0o700);
	} catch {
		// Best effort permissions tightening.
	}

	const hashes = superuserHashesDir(overrideAuthDir);
	mkdirSync(hashes, { recursive: true, mode: 0o700 });
	try {
		chmodSync(hashes, 0o700);
	} catch {
		// Best effort permissions tightening.
	}
}