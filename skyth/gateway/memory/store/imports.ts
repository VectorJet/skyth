import { readFile } from "node:fs/promises";
import {
	archiveClaudeExportFile,
	archiveClaudePayload,
} from "@/gateway/memory/archive.ts";
import type { MemoryStoreContext } from "@/gateway/memory/store/context.ts";
import type {
	ClaudeExportConversation,
	ClaudeSessionMetadata,
} from "@/gateway/memory/store/types.ts";
import { claudeConversationsFromExport } from "@/gateway/memory/store/types.ts";
import { messageText, nowIso } from "@/gateway/memory/store/helpers.ts";
import {
	upsertMessage,
	deleteContentForConversation,
} from "@/gateway/memory/store/persistence.ts";

export function importClaudeExportFile(
	ctx: MemoryStoreContext,
	filePath: string,
	source = "claude_export",
): Promise<{ conversations: number; messages: number; chunks: number }> {
	return readFile(filePath, "utf8").then((raw) => {
		const parsed = JSON.parse(raw);
		const archived = archiveClaudeExportFile(filePath);
		return importClaudeExport(
			ctx,
			parsed,
			source === "claude_export" ? archived.source : source,
			{ archiveRaw: false },
		);
	});
}

export function importClaudeExport(
	ctx: MemoryStoreContext,
	input: unknown,
	source = "claude_export",
	options: {
		archiveRaw?: boolean;
		skipFts?: boolean;
		replaceExisting?: boolean;
	} = {},
): { conversations: number; messages: number; chunks: number } {
	const archiveRaw = options.archiveRaw ?? true;
	const effectiveSource =
		archiveRaw && source === "claude_export"
			? archiveClaudePayload(input, "claude").source
			: source;
	const conversations = claudeConversationsFromExport(input);
	let conversationCount = 0;
	let messageCount = 0;
	let chunkCount = 0;

	const tx = ctx.db.transaction((items: ClaudeExportConversation[]) => {
		for (const item of items) {
			const result = upsertClaudeConversation(ctx, item, effectiveSource, {
				archiveRaw: false,
				skipFts: options.skipFts,
				replaceExisting: options.replaceExisting,
			});
			conversationCount++;
			messageCount += result.messages;
			chunkCount += result.chunks;
		}
	});
	tx(conversations);

	return {
		conversations: conversationCount,
		messages: messageCount,
		chunks: chunkCount,
	};
}

export function upsertClaudeConversation(
	ctx: MemoryStoreContext,
	conversation: ClaudeExportConversation,
	source = "claude_live",
	options: {
		archiveRaw?: boolean;
		skipFts?: boolean;
		replaceExisting?: boolean;
	} = {},
): { messages: number; chunks: number } {
	const effectiveSource =
		(options.archiveRaw ?? source === "claude_live")
			? archiveClaudePayload(conversation, "claude").source
			: source;
	const externalUuid = conversation.uuid;
	if (!externalUuid) throw new Error("Claude conversation is missing uuid");
	const conversationId = `claude:${externalUuid}`;
	const title = conversation.name?.trim() || "Untitled Claude conversation";
	const createdAt = conversation.created_at ?? nowIso();
	const updatedAt = conversation.updated_at ?? createdAt;
	const raw = JSON.stringify(conversation);

	ctx.db
		.query(
			`INSERT INTO conversations (id, provider, external_uuid, title, summary, created_at, updated_at, source, raw_json)
         VALUES ($id, "claude", $external_uuid, $title, $summary, $created_at, $updated_at, $source, $raw_json)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           summary = excluded.summary,
           updated_at = excluded.updated_at,
           source = excluded.source,
           raw_json = excluded.raw_json`,
		)
		.run({
			$id: conversationId,
			$external_uuid: externalUuid,
			$title: title,
			$summary: conversation.summary ?? "",
			$created_at: createdAt,
			$updated_at: updatedAt,
			$source: effectiveSource,
			$raw_json: raw,
		});

	if (options.replaceExisting ?? true) {
		deleteContentForConversation(ctx, conversationId);
	}

	let messages = 0;
	let chunks = 0;
	for (const msg of conversation.chat_messages ?? []) {
		const text = messageText(msg);
		if (!msg.uuid || !text) continue;
		const result = upsertMessage(ctx, {
			conversationId,
			provider: "claude",
			externalUuid: msg.uuid,
			parentExternalUuid: msg.parent_message_uuid ?? undefined,
			sender: msg.sender ?? "unknown",
			text,
			rawJson: JSON.stringify(msg),
			createdAt: msg.created_at ?? createdAt,
			updatedAt: msg.updated_at ?? msg.created_at ?? updatedAt,
			skipFts: options.skipFts,
			replaceExisting: options.replaceExisting,
		});
		messages++;
		chunks += result.chunks;
	}

	return { messages, chunks };
}

export function upsertClaudeSessionMetadata(
	ctx: MemoryStoreContext,
	input: ClaudeSessionMetadata | ClaudeSessionMetadata[],
): { sessions: number } {
	const items = Array.isArray(input) ? input : [input];
	let sessions = 0;
	const tx = ctx.db.transaction(() => {
		for (const item of items) {
			if (!item?.uuid) continue;
			const conversationId = `claude:${item.uuid}`;
			const title = item.name?.trim() || "Untitled Claude conversation";
			const createdAt = item.created_at ?? nowIso();
			const updatedAt = item.updated_at ?? createdAt;
			ctx.db
				.query(
					`INSERT INTO conversations (id, provider, external_uuid, title, summary, created_at, updated_at, source, raw_json)
             VALUES ($id, "claude", $external_uuid, $title, $summary, $created_at, $updated_at, "claude_recents", $raw_json)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               summary = CASE
                 WHEN excluded.summary != "" THEN excluded.summary
                 ELSE conversations.summary
               END,
               updated_at = excluded.updated_at,
               raw_json = CASE
                 WHEN conversations.raw_json IS NULL OR conversations.raw_json = "" OR conversations.raw_json = "{}"
                   THEN excluded.raw_json
                 ELSE conversations.raw_json
               END`,
				)
				.run({
					$id: conversationId,
					$external_uuid: item.uuid,
					$title: title,
					$summary: item.summary ?? "",
					$created_at: createdAt,
					$updated_at: updatedAt,
					$raw_json: JSON.stringify(item),
				});
			sessions++;
		}
	});
	tx();
	return { sessions };
}
