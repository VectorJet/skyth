import { appendGatewayTurnRecord } from "@/gateway/memory/archive.ts";
import type { MemoryStoreContext } from "@/gateway/memory/store/context.ts";
import type { GatewayTurnRecord } from "@/gateway/memory/store/types.ts";
import { stableId } from "@/gateway/memory/store/helpers.ts";
import { upsertMessage } from "@/gateway/memory/store/persistence.ts";

export function upsertGatewayTurn(
	ctx: MemoryStoreContext,
	record: GatewayTurnRecord,
): { conversationId: string; messages: number; chunks: number } {
	const archived =
		record.archiveRaw === false
			? null
			: appendGatewayTurnRecord({
					channel: record.channel,
					chatId: record.chatId,
					userText: record.userText,
					assistantText: record.assistantText,
					userMessageId: record.userMessageId,
					traceId: record.traceId,
					ts: record.ts,
				});
	const source = record.source ?? archived?.source ?? "gateway_live";
	const safeChannel = record.channel.replace(/[^a-zA-Z0-9_-]/g, "_");
	const conversationId = `gateway:${safeChannel}:${record.chatId}`;
	const ts = record.ts ?? Date.now();
	const createdAt = new Date(ts).toISOString();
	const title = `Gateway ${record.channel} ${record.chatId}`;

	ctx.db
		.query(
			`INSERT INTO conversations (id, provider, external_uuid, title, summary, created_at, updated_at, source, raw_json)
         VALUES ($id, "gateway", $external_uuid, $title, "", $created_at, $updated_at, $source, "{}")
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, title = excluded.title, source = excluded.source`,
		)
		.run({
			$id: conversationId,
			$external_uuid: `${record.channel}:${record.chatId}`,
			$title: title,
			$created_at: createdAt,
			$updated_at: createdAt,
			$source: source,
		});

	let messages = 0;
	let chunks = 0;
	let parentId: string | undefined;
	if (record.userText?.trim()) {
		const externalUuid =
			record.userMessageId ??
			stableId(["gateway-user", conversationId, String(ts), record.userText]);
		const result = upsertMessage(ctx, {
			conversationId,
			provider: "gateway",
			externalUuid,
			parentExternalUuid: undefined,
			sender: "human",
			text: record.userText,
			rawJson: JSON.stringify({ ...record, assistantText: undefined }),
			createdAt,
			updatedAt: createdAt,
			skipFts: record.skipFts,
			replaceExisting: record.replaceExisting,
		});
		parentId = result.messageId;
		messages++;
		chunks += result.chunks;
	}
	if (record.assistantText?.trim()) {
		const externalUuid =
			record.traceId ??
			stableId([
				"gateway-assistant",
				conversationId,
				String(ts),
				record.assistantText,
			]);
		const result = upsertMessage(ctx, {
			conversationId,
			provider: "gateway",
			externalUuid,
			parentExternalUuid: parentId,
			sender: "assistant",
			text: record.assistantText,
			rawJson: JSON.stringify({ ...record, userText: undefined }),
			createdAt,
			updatedAt: createdAt,
			skipFts: record.skipFts,
			replaceExisting: record.replaceExisting,
		});
		messages++;
		chunks += result.chunks;
	}

	return { conversationId, messages, chunks };
}
