import { describe, expect, test } from "bun:test";
import {
	plainPasswordToB64,
	shouldUnlockQuasarForGateway,
} from "@/gateway/gateway";

describe("gateway Quasar unlock password encoding", () => {
	test("matches onboarding normalization for prompted plain-text passwords", () => {
		expect(plainPasswordToB64("  secret-password  ")).toBe(
			Buffer.from("secret-password", "utf8").toString("base64"),
		);
	});

	test("treats blank plain-text passwords as unavailable", () => {
		expect(plainPasswordToB64("   ")).toBeUndefined();
	});

	test("prompts when auth db exists but daemon has not unlocked it yet", () => {
		expect(shouldUnlockQuasarForGateway(false, true)).toBe(true);
	});

	test("skips unlock only when no auth state exists", () => {
		expect(shouldUnlockQuasarForGateway(false, false)).toBe(false);
	});
});
