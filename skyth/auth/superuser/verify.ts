import { existsSync, readFileSync } from "node:fs";
import * as argon2 from "argon2";
import { isRateLimited, addVerifyAttempt, logAuditEvent, ensureAuthPaths } from "./audit";
import { superuserHashesPath } from "./paths";
import type { SuperuserPasswordRecord } from "./types";

export async function verifySuperuserPassword(
	password: string,
	overrideAuthDir?: string,
): Promise<boolean> {
	if (isRateLimited(overrideAuthDir)) {
		logAuditEvent(
			{ action: "verify_attempt", success: false, details: "Rate limited" },
			overrideAuthDir,
		);
		return false;
	}

	const trimmed = password.trim();
	if (!trimmed) {
		addVerifyAttempt(false, overrideAuthDir);
		return false;
	}

	const path = superuserHashesPath(overrideAuthDir);
	if (!existsSync(path)) {
		addVerifyAttempt(false, overrideAuthDir);
		return false;
	}

	let lines: string[] = [];
	try {
		lines = readFileSync(path, "utf-8")
			.split("\n")
			.filter((line) => line.trim().length > 0);
	} catch {
		addVerifyAttempt(false, overrideAuthDir);
		return false;
	}

	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const line = lines[index];
		if (!line) continue;
		try {
			const parsed = JSON.parse(line) as Partial<SuperuserPasswordRecord>;
			const hash = parsed?.kdf?.hash;
			if (!hash) continue;
			if (await argon2.verify(hash, trimmed)) {
				addVerifyAttempt(true, overrideAuthDir);
				logAuditEvent(
					{ action: "verify_attempt", success: true },
					overrideAuthDir,
				);
				return true;
			}
		} catch {
			continue;
		}
	}

	addVerifyAttempt(false, overrideAuthDir);
	logAuditEvent(
		{ action: "verify_attempt", success: false, details: "Invalid password" },
		overrideAuthDir,
	);
	return false;
}