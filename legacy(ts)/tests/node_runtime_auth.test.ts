import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addNode } from "../skyth/auth/cmd/token/shared";
import { authorizeInboundNodeMessage } from "../skyth/auth/cmd/token/runtime-auth";

function createTempHome(name: string): string {
	const base = join(
		process.cwd(),
		".tmp",
		`${name}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
	);
	mkdirSync(base, { recursive: true });
	return base;
}

function createDeviceTokenMarker(home: string): void {
	const tokenPath = join(home, ".skyth", "auth", "device", "identity", "token");
	mkdirSync(join(home, ".skyth", "auth", "device", "identity"), {
		recursive: true,
	});
	writeFileSync(
		tokenPath,
		JSON.stringify({ kind: "device_identity" }),
		"utf-8",
	);
}

describe("runtime node auth", () => {
	test("blocks untrusted senders when device token exists", () => {
		const prevHome = process.env.HOME;
		const home = createTempHome("runtime-auth-untrusted");
		process.env.HOME = home;

		try {
			createDeviceTokenMarker(home);

			const result = authorizeInboundNodeMessage({
				channel: "telegram",
				senderId: "123",
				content: "hello",
			});

			expect(result.allowed).toBeFalse();
			expect(result.reason).toContain("untrusted");
		} finally {
			process.env.HOME = prevHome;
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("allows trusted sender without per-message auth token", () => {
		const prevHome = process.env.HOME;
		const home = createTempHome("runtime-auth-trusted");
		process.env.HOME = home;

		try {
			createDeviceTokenMarker(home);
			addNode("telegram", "7405495226", { source: "test" });

			const sessionMessage = authorizeInboundNodeMessage({
				channel: "telegram",
				senderId: "7405495226",
				content: "regular message",
			});
			expect(sessionMessage.allowed).toBeTrue();
			expect(sessionMessage.content).toBe("regular message");
		} finally {
			process.env.HOME = prevHome;
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("blocks sender paired on different channel", () => {
		const prevHome = process.env.HOME;
		const home = createTempHome("runtime-auth-channel-mismatch");
		process.env.HOME = home;

		try {
			createDeviceTokenMarker(home);
			addNode("discord", "u-1", { source: "test" });

			const result = authorizeInboundNodeMessage({
				channel: "telegram",
				senderId: "u-1",
				content: "hello",
			});

			expect(result.allowed).toBeFalse();
			expect(result.reason).toContain("untrusted");
		} finally {
			process.env.HOME = prevHome;
			rmSync(home, { recursive: true, force: true });
		}
	});
});
