import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const originalPasswordB64 = process.env.SKYTH_QUASAR_PASSWORD_B64;
const originalPassword = process.env.SKYTH_QUASAR_PASSWORD;

const mockStatus = mock(() => Promise.resolve({ auth_initialized: true }));
const mockUnlock = mock(() => Promise.resolve());
const mockOnboard = mock(() => Promise.resolve());
const mockOpenDb = mock(() => Promise.resolve());

const mockClient = {
	status: mockStatus,
	unlock: mockUnlock,
	onboard: mockOnboard,
	openDb: mockOpenDb,
};

mock.module("@/quasar/client", () => ({
	getQuasarClient: () => mockClient,
	QuasarClient: class {},
}));

const { initializeQuasarDurability } = await import(
	"@/gateway/durable/quasar-adapters"
);
const { quasarPasswordB64 } = await import("@/gateway/durable/quasar-adapters");

describe("initializeQuasarDurability", () => {
	beforeEach(() => {
		delete process.env.SKYTH_QUASAR_PASSWORD_B64;
		delete process.env.SKYTH_QUASAR_PASSWORD;
		mockStatus.mockClear();
		mockUnlock.mockClear();
		mockOnboard.mockClear();
		mockOpenDb.mockClear();
	});

	afterEach(() => {
		if (originalPasswordB64 === undefined) {
			delete process.env.SKYTH_QUASAR_PASSWORD_B64;
		} else {
			process.env.SKYTH_QUASAR_PASSWORD_B64 = originalPasswordB64;
		}
		if (originalPassword === undefined) {
			delete process.env.SKYTH_QUASAR_PASSWORD;
		} else {
			process.env.SKYTH_QUASAR_PASSWORD = originalPassword;
		}
	});

	test("uses an already-unlocked initialized daemon without env password", async () => {
		await expect(initializeQuasarDurability(mockClient as any)).resolves.toBe(
			true,
		);

		expect(mockUnlock).not.toHaveBeenCalled();
		expect(mockOnboard).not.toHaveBeenCalled();
		expect(mockOpenDb).toHaveBeenCalledTimes(4);
	});

	test("unlocks with env password when available", async () => {
		process.env.SKYTH_QUASAR_PASSWORD_B64 = "c2VjcmV0";

		await expect(initializeQuasarDurability(mockClient as any)).resolves.toBe(
			true,
		);

		expect(mockUnlock).toHaveBeenCalledWith("c2VjcmV0");
		expect(mockOpenDb).toHaveBeenCalledTimes(4);
	});

	test("normalizes plain env password like onboarding", () => {
		process.env.SKYTH_QUASAR_PASSWORD = "  secret  ";

		expect(quasarPasswordB64()).toBe(
			Buffer.from("secret", "utf8").toString("base64"),
		);
	});
});
