import { describe, expect, test } from "bun:test";
import {
	formatDateForGateway,
	getTrustedNodeCounts,
	validateGatewayFlags,
} from "@/cli/runtime/commands/gateway_helpers";

describe("gateway command helpers", () => {
	test("formats dates consistently for gateway logs", () => {
		expect(formatDateForGateway(1640995200000)).toBe("2022-01-01");
		expect(formatDateForGateway(Date.UTC(2026, 5, 15, 14, 30, 0))).toBe(
			"2026-06-15",
		);
	});

	test("counts trusted nodes by channel", () => {
		const nodes = [
			{ channel: "telegram", sender_id: "1", trusted: true },
			{ channel: "telegram", sender_id: "1", trusted: true }, // duplicate
			{ channel: "discord", sender_id: "2", trusted: true },
			{ channel: "email", sender_id: "3", trusted: false }, // untrusted
			{ channel: "telegram", sender_id: "4", trusted: false }, // untrusted
		];
		const channels = ["telegram", "discord", "email"];

		const counts = getTrustedNodeCounts(nodes, channels);
		expect(counts.totalUniqueTrusted).toBe(2); // sender_id 1, 2
		expect(counts.byChannel).toEqual({
			telegram: ["1"],
			discord: ["2"],
			email: [], // no trusted nodes
		});
	});

	test("validates gateway command flags", () => {
		expect(validateGatewayFlags({ model: "gpt-4" })).toEqual([]);
		expect(validateGatewayFlags({ model: "", port: "invalid" })).toEqual([
			"port",
		]);
	});
});
