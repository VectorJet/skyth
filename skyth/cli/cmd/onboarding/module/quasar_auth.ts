import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { QuasarClient } from "@/quasar/client.ts";

function encodePassword(value: string): string {
	return Buffer.from(new TextEncoder().encode(value)).toString("base64");
}

export function hasQuasarAuthRecord(): boolean {
	return existsSync(join(homedir(), ".skyth", "auth.quasardb"));
}

export function validatePasswordStrength(password: string): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];
	if (password.length < 8) errors.push("Password must be at least 8 characters.");
	if (!/[A-Za-z]/.test(password)) errors.push("Password must include a letter.");
	if (!/[0-9]/.test(password)) errors.push("Password must include a number.");
	return { valid: errors.length === 0, errors };
}

export async function onboardQuasar(
	username: string,
	password: string,
): Promise<void> {
	await new QuasarClient({ timeoutMs: 60_000 }).onboard(
		username,
		encodePassword(password),
	);
}

export async function unlockQuasar(password: string): Promise<void> {
	await new QuasarClient({ timeoutMs: 30_000 }).unlock(encodePassword(password));
}
