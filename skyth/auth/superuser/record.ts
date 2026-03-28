import {
	appendFileSync,
	chmodSync,
	existsSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { ensureAuthPaths } from "./audit";
import { superuserHashesPath } from "./paths";
import {
	ARGON2_MEMORY_COST,
	ARGON2_TIME_COST,
	ARGON2_PARALLELISM,
	ARGON2_HASH_LENGTH,
	SALT_BYTES,
	ARGON2_SALT_BYTES,
	IV_BYTES,
	MAX_PASSWORD_HISTORY,
} from "./constants";
import { validatePasswordStrength } from "./validation";
import { logAuditEvent } from "./audit";
import type { SuperuserPasswordRecord } from "./types";

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