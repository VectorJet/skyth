import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import * as argon2 from "argon2";

const PASS_FILE = "pass.json";
const ARGON2_MEMORY_COST = 65536;
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 4;
const SALT_BYTES = 16;

interface PassRecord {
	password_hash: string;
	salt: string;
	created_at: string;
}

function homePath(): string {
	return process.env.HOME || homedir();
}

function authRoot(overrideAuthDir?: string): string {
	return overrideAuthDir || join(homePath(), ".skyth", "auth");
}

function passPath(overrideAuthDir?: string): string {
	return join(authRoot(overrideAuthDir), PASS_FILE);
}

function ensureAuthDir(overrideAuthDir?: string): void {
	const root = authRoot(overrideAuthDir);
	mkdirSync(root, { recursive: true, mode: 0o700 });
	try {
		chmodSync(root, 0o700);
	} catch {
		// Best effort permissions tightening.
	}
}

export function hasPassword(overrideAuthDir?: string): boolean {
	const path = passPath(overrideAuthDir);
	if (!existsSync(path)) return false;
	try {
		const raw = readFileSync(path, "utf-8").trim();
		if (!raw) return false;
		const parsed = JSON.parse(raw) as Partial<PassRecord>;
		return (
			typeof parsed.password_hash === "string" &&
			parsed.password_hash.length > 0
		);
	} catch {
		return false;
	}
}

export async function writePassword(
	password: string,
	overrideAuthDir?: string,
): Promise<{ path: string }> {
	const trimmed = password.trim();
	if (!trimmed) {
		throw new Error("Password cannot be empty.");
	}

	ensureAuthDir(overrideAuthDir);

	const salt = randomBytes(SALT_BYTES);
	const hash = await argon2.hash(trimmed, {
		type: argon2.argon2id,
		salt,
		memoryCost: ARGON2_MEMORY_COST,
		timeCost: ARGON2_TIME_COST,
		parallelism: ARGON2_PARALLELISM,
	});

	const record: PassRecord = {
		password_hash: hash,
		salt: salt.toString("base64"),
		created_at: new Date().toISOString(),
	};

	const filePath = passPath(overrideAuthDir);
	writeFileSync(filePath, JSON.stringify(record, null, 2) + "\n", {
		encoding: "utf-8",
		mode: 0o600,
	});
	try {
		chmodSync(filePath, 0o600);
	} catch {
		// Best effort permissions tightening.
	}

	return { path: filePath };
}

export async function verifyPassword(
	password: string,
	overrideAuthDir?: string,
): Promise<boolean> {
	const trimmed = password.trim();
	if (!trimmed) return false;

	const filePath = passPath(overrideAuthDir);
	if (!existsSync(filePath)) return false;

	try {
		const raw = readFileSync(filePath, "utf-8").trim();
		if (!raw) return false;
		const parsed = JSON.parse(raw) as Partial<PassRecord>;
		const hash = parsed.password_hash;
		if (!hash) return false;
		return await argon2.verify(hash, trimmed);
	} catch {
		return false;
	}
}
