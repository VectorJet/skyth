import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	isChannelDeliveryTarget,
	loadLastActiveChannelTarget,
	resolveDeliveryTarget,
} from "../skyth/cli/gateway_delivery";

function writeSessionMetadata(
	workspace: string,
	file: string,
	meta: {
		updatedAt: string;
		lastChannel: string;
		lastChatId: string;
	},
): void {
	const sessionsDir = join(workspace, "sessions");
	mkdirSync(sessionsDir, { recursive: true });
	const payload = {
		_type: "metadata",
		key: file.replace(".jsonl", ""),
		created_at: meta.updatedAt,
		updated_at: meta.updatedAt,
		metadata: {
			last_channel: meta.lastChannel,
			last_chat_id: meta.lastChatId,
		},
		last_consolidated: 0,
	};
	writeFileSync(
		join(sessionsDir, file),
		`${JSON.stringify(payload)}\n`,
		"utf-8",
	);
}

describe("gateway delivery target resolution", () => {
	test("filters non-channel targets", () => {
		expect(isChannelDeliveryTarget("telegram")).toBeTrue();
		expect(isChannelDeliveryTarget("discord")).toBeTrue();
		expect(isChannelDeliveryTarget("cli")).toBeFalse();
		expect(isChannelDeliveryTarget("cron")).toBeFalse();
		expect(isChannelDeliveryTarget("heartbeat")).toBeFalse();
	});

	test("loads latest non-system target from session metadata", () => {
		const workspace = join(
			process.cwd(),
			".tmp",
			`gateway-target-${Date.now()}`,
		);
		writeSessionMetadata(workspace, "heartbeat.jsonl", {
			updatedAt: "2026-02-25T19:05:00.000Z",
			lastChannel: "heartbeat",
			lastChatId: "heartbeat",
		});
		writeSessionMetadata(workspace, "telegram_1.jsonl", {
			updatedAt: "2026-02-25T19:01:00.000Z",
			lastChannel: "telegram",
			lastChatId: "7405495226",
		});
		writeSessionMetadata(workspace, "discord_1.jsonl", {
			updatedAt: "2026-02-25T19:03:00.000Z",
			lastChannel: "discord",
			lastChatId: "1468353179342209252",
		});

		expect(loadLastActiveChannelTarget(workspace)).toEqual({
			channel: "discord",
			chatId: "1468353179342209252",
		});
	});

	test("prefers explicit target and falls back when absent", () => {
		const fallback = { channel: "telegram", chatId: "7405495226" };
		expect(
			resolveDeliveryTarget({
				channel: "discord",
				chatId: "1468353179342209252",
				fallback,
			}),
		).toEqual({
			channel: "discord",
			chatId: "1468353179342209252",
		});

		expect(resolveDeliveryTarget({ fallback })).toEqual(fallback);
	});

	test("fills missing chat id from fallback when channel matches", () => {
		const fallback = { channel: "telegram", chatId: "7405495226" };
		expect(
			resolveDeliveryTarget({
				channel: "telegram",
				fallback,
			}),
		).toEqual(fallback);
	});
});
