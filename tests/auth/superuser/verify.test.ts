import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendFileSync, mkdirSync } from "node:fs";
import { verifySuperuserPassword } from "@/auth/superuser/verify";
import { writeSuperuserPasswordRecord } from "@/auth/superuser/record";
import { superuserHashesDir, superuserHashesPath } from "@/auth/superuser/paths";

describe("verifySuperuserPassword", () => {
	let tempAuthDir: string;

	beforeAll(async () => {
		tempAuthDir = await mkdtemp(join(tmpdir(), "skyth-auth-test-"));
	});

	afterAll(async () => {
		await rm(tempAuthDir, { recursive: true, force: true });
	});

	test("should handle and skip malformed lines when verifying", async () => {
		// First write a valid password record
		const validPassword = "CorrectPassword123!";
		await writeSuperuserPasswordRecord(validPassword, tempAuthDir);

		// Now, let's manually corrupt the file by appending bad lines
		const path = superuserHashesPath(tempAuthDir);

		// 1. Completely invalid JSON
		appendFileSync(path, "{bad_json: true\n", "utf-8");

		// 2. Valid JSON, but missing the kdf.hash field
		appendFileSync(path, JSON.stringify({ version: 1, kind: "superuser_password" }) + "\n", "utf-8");

		// 3. Empty line (should be filtered out by readFileSync().split("\n").filter(...) but let's add it)
		appendFileSync(path, "\n", "utf-8");

		// The function should read from the bottom up.
		// It will encounter the empty line (skipped), the missing hash line (skipped),
		// the bad JSON line (throws, caught, skipped), and finally the valid record.

		const result = await verifySuperuserPassword(validPassword, tempAuthDir);
		expect(result).toBe(true);

		const wrongResult = await verifySuperuserPassword("WrongPassword123!", tempAuthDir);
		expect(wrongResult).toBe(false);
	});
});
