import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";

export const ARGON2_MEMORY_COST = 19456;
export const ARGON2_TIME_COST = 2;
export const ARGON2_PARALLELISM = 1;
export const ARGON2_HASH_LENGTH = 32;
export const SALT_BYTES = 4;
export const ARGON2_SALT_BYTES = 16;
export const IV_BYTES = 12;
export const TOKEN_BYTES = 32;
export const PAIRING_CODE_LENGTH = 16;
export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateToken(): string {
	const bytes = randomBytes(TOKEN_BYTES);
	return bytes.toString("base64url");
}

export function generateTokenId(): string {
	return randomBytes(8).toString("hex");
}

export function generateNodeId(): string {
	return randomBytes(8).toString("hex");
}

export function generateNodeToken(): string {
	const bytes = randomBytes(PAIRING_CODE_LENGTH);
	let token = "";
	for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
		token += CODE_CHARS[bytes[i]! % CODE_CHARS.length]!;
	}
	return token;
}

export function digestNodeToken(token: string): string {
	const normalized = String(token ?? "")
		.trim()
		.toUpperCase();
	return `sha256:${createHash("sha256").update(normalized, "utf-8").digest("hex")}`;
}

export function secureCompare(a: string, b: string): boolean {
	if (typeof a !== "string" || typeof b !== "string") return false;
	if (a.length > 4096 || b.length > 4096) return false;

	const key = randomBytes(32);
	const aHash = createHmac("sha256", key).update(a, "utf-8").digest();
	const bHash = createHmac("sha256", key).update(b, "utf-8").digest();

	return timingSafeEqual(aHash, bHash);
}

export function matchesNodeToken(stored: string, candidate: string): boolean {
	const normalizedStored = String(stored ?? "").trim();
	const normalizedCandidate = String(candidate ?? "")
		.trim()
		.toUpperCase();
	if (!normalizedStored || !normalizedCandidate) return false;
	if (secureCompare(normalizedStored, normalizedCandidate)) return true;
	if (normalizedStored.startsWith("sha256:")) {
		return secureCompare(
			normalizedStored,
			digestNodeToken(normalizedCandidate),
		);
	}
	return secureCompare(normalizedStored.toUpperCase(), normalizedCandidate);
}

export function deriveKey(argonHash: string): Buffer {
	return createHash("sha256").update(argonHash, "utf-8").digest();
}

export function encryptToken(
	token: string,
	key: Buffer,
): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(token, "utf-8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();
	return { ciphertext, iv, authTag };
}

export function decryptToken(
	ciphertext: Buffer,
	key: Buffer,
	iv: Buffer,
	authTag: Buffer,
): string {
	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(authTag);
	const plain = Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]).toString("utf-8");
	return plain;
}

export function createArgonSalt(): Buffer {
	const saltSeed = randomBytes(SALT_BYTES);
	return createHash("sha256")
		.update(saltSeed)
		.digest()
		.subarray(0, ARGON2_SALT_BYTES);
}