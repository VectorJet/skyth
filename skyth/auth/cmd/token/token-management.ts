import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as argon2 from "argon2";
import type { DeviceIdentityToken } from "./types";
import { tokenPath, ensureDevicePaths } from "./paths";
import {
	ARGON2_MEMORY_COST,
	ARGON2_TIME_COST,
	ARGON2_PARALLELISM,
	ARGON2_HASH_LENGTH,
	generateToken,
	generateTokenId,
	createArgonSalt,
	deriveKey,
	encryptToken,
	decryptToken,
} from "./crypto-utils";

export function getDeviceTokenInfo(
	overrideAuthDir?: string,
): DeviceIdentityToken | null {
	const path = tokenPath(overrideAuthDir);
	if (!existsSync(path)) return null;
	try {
		const raw = readFileSync(path, "utf-8");
		const record = JSON.parse(raw) as DeviceIdentityToken;
		if (record.kind !== "device_identity") return null;
		return record;
	} catch {
		return null;
	}
}

export async function createDeviceToken(
	password: string,
	overrideAuthDir?: string,
): Promise<{ path: string; token: DeviceIdentityToken }> {
	const trimmed = password.trim();
	if (!trimmed) {
		throw new Error("Password cannot be empty.");
	}

	ensureDevicePaths(overrideAuthDir);

	const token = generateToken();
	const tokenId = generateTokenId();
	const argonSalt = createArgonSalt();

	const argonHash = await argon2.hash(trimmed, {
		type: argon2.argon2id,
		salt: argonSalt,
		memoryCost: ARGON2_MEMORY_COST,
		timeCost: ARGON2_TIME_COST,
		parallelism: ARGON2_PARALLELISM,
		hashLength: ARGON2_HASH_LENGTH,
	});

	const key = deriveKey(argonHash);
	const { ciphertext, iv, authTag } = encryptToken(token, key);

	const record: DeviceIdentityToken = {
		version: 1,
		kind: "device_identity",
		token_id: tokenId,
		created_at: new Date().toISOString(),
		salt_bits: 32,
		salt_b64: argonSalt.toString("base64"),
		kdf: {
			algorithm: "argon2id",
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
		nodes: [],
	};

	const path = tokenPath(overrideAuthDir);
	writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 });

	return { path, token: record };
}

export async function decryptDeviceToken(
	password: string,
	overrideAuthDir?: string,
): Promise<string | null> {
	const trimmed = password.trim();
	if (!trimmed) return null;

	const path = tokenPath(overrideAuthDir);
	if (!existsSync(path)) return null;

	let record: DeviceIdentityToken;
	try {
		const raw = readFileSync(path, "utf-8");
		record = JSON.parse(raw) as DeviceIdentityToken;
	} catch {
		return null;
	}

	if (record.kind !== "device_identity") return null;

	try {
		const hash = record.kdf?.hash;
		if (!hash) return null;

		if (!(await argon2.verify(hash, trimmed))) return null;

		const key = deriveKey(hash);
		const iv = Buffer.from(record.encryption.iv_b64, "base64");
		const authTag = Buffer.from(record.encryption.auth_tag_b64, "base64");
		const ciphertext = Buffer.from(record.encryption.ciphertext_b64, "base64");

		return decryptToken(ciphertext, key, iv, authTag);
	} catch {
		return null;
	}
}

export async function changeDeviceToken(
	newPassword: string,
	overrideAuthDir?: string,
): Promise<{ path: string; token: DeviceIdentityToken }> {
	const oldRecord = getDeviceTokenInfo(overrideAuthDir);
	if (!oldRecord) {
		throw new Error("No device token exists. Create one first.");
	}

	const token = generateToken();
	const tokenId = generateTokenId();
	const argonSalt = createArgonSalt();

	const argonHash = await argon2.hash(newPassword, {
		type: argon2.argon2id,
		salt: argonSalt,
		memoryCost: ARGON2_MEMORY_COST,
		timeCost: ARGON2_TIME_COST,
		parallelism: ARGON2_PARALLELISM,
		hashLength: ARGON2_HASH_LENGTH,
	});

	const key = deriveKey(argonHash);
	const { ciphertext, iv, authTag } = encryptToken(token, key);

	const record: DeviceIdentityToken = {
		version: 1,
		kind: "device_identity",
		token_id: tokenId,
		created_at: new Date().toISOString(),
		salt_bits: 32,
		salt_b64: argonSalt.toString("base64"),
		kdf: {
			algorithm: "argon2id",
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
		nodes: oldRecord.nodes,
	};

	const path = tokenPath(overrideAuthDir);
	writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 });

	return { path, token: record };
}

export async function rotateDeviceToken(
	password: string,
	overrideAuthDir?: string,
): Promise<{ path: string; token: DeviceIdentityToken }> {
	return changeDeviceToken(password, overrideAuthDir);
}