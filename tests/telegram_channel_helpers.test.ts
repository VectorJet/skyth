import { describe, expect, test } from "bun:test";
import {
	extractPairingCode,
	isCommand,
	isPairingPayload,
} from "../skyth/channels/telegram/helpers";

describe("telegram channel helpers", () => {
	test("detects command forms", () => {
		expect(isCommand("/start", "start")).toBeTrue();
		expect(isCommand("/start@SkythBot hello", "start")).toBeTrue();
		expect(isCommand("hello", "start")).toBeFalse();
	});

	test("detects pairing payloads", () => {
		expect(isPairingPayload("/start ABC-123")).toBeTrue();
		expect(isPairingPayload("ABC123")).toBeTrue();
		expect(isPairingPayload("hello world")).toBeFalse();
	});

	test("extracts normalized pairing code", () => {
		expect(extractPairingCode("abc-123")).toBe("ABC123");
		expect(extractPairingCode("hello")).toBeNull();
	});
});
