import { describe, expect, it } from "bun:test";
import { deriveIdentityKey } from "@/auth/device-fingerprint";

describe("deriveIdentityKey", () => {
	it("should return a 32-byte Buffer for a given string", () => {
		const key = deriveIdentityKey("my-secret-device-token");
		expect(Buffer.isBuffer(key)).toBe(true);
		expect(key.length).toBe(32);
	});

	it("should be deterministic for the same input", () => {
		const token = "consistent-token-123";
		const key1 = deriveIdentityKey(token);
		const key2 = deriveIdentityKey(token);
		expect(key1.equals(key2)).toBe(true);
	});

	it("should produce different keys for different inputs", () => {
		const key1 = deriveIdentityKey("token-A");
		const key2 = deriveIdentityKey("token-B");
		expect(key1.equals(key2)).toBe(false);
	});

	it("should handle an empty string and still return a 32-byte Buffer", () => {
		const key = deriveIdentityKey("");
		expect(Buffer.isBuffer(key)).toBe(true);
		expect(key.length).toBe(32);
	});
});
