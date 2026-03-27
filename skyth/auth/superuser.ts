import {
	appendFileSync,
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import * as argon2 from "argon2";

const SUPERUSER_HASH_FILE = "superuser_password.jsonl";
const ARGON2_MEMORY_COST = 19456;
const ARGON2_TIME_COST = 2;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32;
const SALT_BYTES = 4; // 32-bit random seed per current requirement.
const ARGON2_SALT_BYTES = 16;
const IV_BYTES = 12;

const MAX_PASSWORD_HISTORY = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_VERIFY_ATTEMPTS = 5;

const VERIFY_ATTEMPTS_FILE = "verify_attempts.jsonl";
const AUDIT_LOG_FILE = "audit_log.jsonl";

const COMMON_PASSWORDS = [
	"password",
	"123456",
	"12345678",
	"qwerty",
	"abc123",
	"monkey",
	"1234567",
	"letmein",
	"trustno1",
	"dragon",
	"baseball",
	"iloveyou",
	"master",
	"sunshine",
	"ashley",
	"bailey",
	"shadow",
	"123123",
	"654321",
	"superman",
	"qazwsx",
	"michael",
	"football",
	"password1",
	"password123",
	"welcome",
	"welcome1",
];

export interface SuperuserPasswordRecord {
	version: 1;
	kind: "superuser_password";
	created_at: string;
	salt_bits: 32;
	salt_b64: string;
	kdf: {
		algorithm: "argon2id";
		salt_derivation: "sha256(seed32)[0:16]";
		hash: string;
		memory_cost: number;
		time_cost: number;
		parallelism: number;
		hash_length: number;
	};
	encryption: {
		algorithm: "aes-256-gcm";
		key_derivation: "sha256(argon2id_hash)";
		iv_b64: string;
		auth_tag_b64: string;
		ciphertext_b64: string;
	};
}

function homePath(): string {
	return process.env.HOME || homedir();
}

function authRoot(overrideAuthDir?: string): string {
	return overrideAuthDir || join(homePath(), ".skyth", "auth");
}

function getAuditLogPath(overrideAuthDir?: string): string {
	return join(authRoot(overrideAuthDir), "superuser", AUDIT_LOG_FILE);
}

function getVerifyAttemptsPath(overrideAuthDir?: string): string {
	return join(authRoot(overrideAuthDir), "superuser", VERIFY_ATTEMPTS_FILE);
}

export function validatePasswordStrength(password: string): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];
	const trimmed = password.trim();

	if (trimmed.length < 12) {
		errors.push("Password must be at least 12 characters long.");
	}
	if (!/[A-Z]/.test(trimmed)) {
		errors.push("Password must contain at least one uppercase letter.");
	}
	if (!/[a-z]/.test(trimmed)) {
		errors.push("Password must contain at least one lowercase letter.");
	}
	if (!/[0-9]/.test(trimmed)) {
		errors.push("Password must contain at least one number.");
	}
	if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(trimmed)) {
		errors.push("Password must contain at least one special character.");
	}
	if (COMMON_PASSWORDS.includes(trimmed.toLowerCase())) {
		errors.push("Password is too common. Choose a stronger password.");
	}

	return { valid: errors.length === 0, errors };
}

function logAuditEvent(
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

interface VerifyAttempt {
	timestamp: number;
	success: boolean;
}

function getVerifyAttempts(overrideAuthDir?: string): VerifyAttempt[] {
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

function addVerifyAttempt(success: boolean, overrideAuthDir?: string): void {
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

function isRateLimited(overrideAuthDir?: string): boolean {
	const attempts = getVerifyAttempts(overrideAuthDir);
	const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS;
	const recentAttempts = attempts.filter(
		(a) => a.timestamp > windowStart && !a.success,
	);
	return recentAttempts.length >= MAX_VERIFY_ATTEMPTS;
}

function cleanupOldRecords(overrideAuthDir?: string): void {
	const path = superuserHashesPath(overrideAuthDir);
	if (!existsSync(path)) return;

	try {
		const raw = readFileSync(path, "utf-8");
		const lines = raw.split("\n").filter((line) => line.trim().length > 0);
		if (lines.length <= MAX_PASSWORD_HISTORY) return;

		const recentLines = lines.slice(-MAX_PASSWORD_HISTORY);
		writeFileSync(path, recentLines.join("\n") + "\n", {
			encoding: "utf-8",
			mode: 0o600,
		});
	} catch {
		console.error("Failed to clean up old password records.");
	}
}

export function superuserHashesDir(overrideAuthDir?: string): string {
	return join(authRoot(overrideAuthDir), "superuser", "hashes");
}

export function superuserHashesPath(overrideAuthDir?: string): string {
	return join(superuserHashesDir(overrideAuthDir), SUPERUSER_HASH_FILE);
}

function ensureAuthPaths(overrideAuthDir?: string): void {
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

export function hasSuperuserPasswordRecord(overrideAuthDir?: string): boolean {
	const path = superuserHashesPath(overrideAuthDir);
	if (!existsSync(path)) return false;
	try {
		const raw = readFileSync(path, "utf-8");
		return raw.split("\n").some((line) => line.trim().length > 0);
	} catch {
		return false;
	}
}

export async function writeSuperuserPasswordRecord(
	password: string,
	overrideAuthDir?: string,
): Promise<{ path: string; record: SuperuserPasswordRecord }> {
	const trimmed = password.trim();
	if (!trimmed) {
		throw new Error("Superuser password cannot be empty.");
	}

	const validation = validatePasswordStrength(trimmed);
	if (!validation.valid) {
		throw new Error(
			`Password validation failed: ${validation.errors.join(" ")}`,
		);
	}

	ensureAuthPaths(overrideAuthDir);

	const saltSeed = randomBytes(SALT_BYTES);
	const argonSalt = createHash("sha256")
		.update(saltSeed)
		.digest()
		.subarray(0, ARGON2_SALT_BYTES);
	const argonHash = await argon2.hash(trimmed, {
		type: argon2.argon2id,
		salt: argonSalt,
		memoryCost: ARGON2_MEMORY_COST,
		timeCost: ARGON2_TIME_COST,
		parallelism: ARGON2_PARALLELISM,
		hashLength: ARGON2_HASH_LENGTH,
	});

	const key = createHash("sha256").update(argonHash, "utf-8").digest();
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(trimmed, "utf-8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	const record: SuperuserPasswordRecord = {
		version: 1,
		kind: "superuser_password",
		created_at: new Date().toISOString(),
		salt_bits: 32,
		salt_b64: saltSeed.toString("base64"),
		kdf: {
			algorithm: "argon2id",
			salt_derivation: "sha256(seed32)[0:16]",
			hash: argonHash,
			memory_cost: ARGON2_MEMORY_COST,
			time_cost: ARGON2_TIME_COST,
			parallelism: ARGON2_PARALLELISM,
			hash_length: ARGON2_HASH_LENGTH,
		},
		encryption: {
			algorithm: "aes-256-gcm",
			key_derivation: "sha256(argon2id_hash)",
			iv_b64: iv.toString("base64"),
			auth_tag_b64: authTag.toString("base64"),
			ciphertext_b64: ciphertext.toString("base64"),
		},
	};

	const path = superuserHashesPath(overrideAuthDir);
	appendFileSync(path, `${JSON.stringify(record)}\n`, {
		encoding: "utf-8",
		mode: 0o600,
	});
	try {
		chmodSync(path, 0o600);
	} catch (err) {
		console.error(
			"Warning: Failed to set file permissions on password record:",
			err,
		);
	}

	cleanupOldRecords(overrideAuthDir);
	logAuditEvent({ action: "password_set", success: true }, overrideAuthDir);

	return { path, record };
}

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
