import { MEMORY_ARCHIVE_SOURCE_PREFIX } from "@/gateway/memory/archive.ts";
import type { MemoryStoreContext } from "@/gateway/memory/store/context.ts";
import type { Sender } from "@/gateway/memory/store/types.ts";
import { chunkText } from "@/gateway/memory/store/helpers.ts";

export function upsertMessage(
	ctx: MemoryStoreContext,
	params: {
		conversationId: string;
		provider: string;
		externalUuid: string;
		parentExternalUuid?: string;
		sender: Sender;
		text: string;
		rawJson: string;
		createdAt: string;
		updatedAt: string;
		skipFts?: boolean;
		replaceExisting?: boolean;
	},
): { messageId: string; chunks: number } {
	const messageId = `${params.provider}:${params.externalUuid}`;
	const parentId = params.parentExternalUuid
		? params.parentExternalUuid.includes(":")
			? params.parentExternalUuid
			: `${params.provider}:${params.parentExternalUuid}`
		: null;

	ctx.db
		.query(
			`INSERT INTO messages
           (id, conversation_id, external_uuid, parent_id, sender, text, raw_json, created_at, updated_at)
         VALUES
           ($id, $conversation_id, $external_uuid, $parent_id, $sender, $text, $raw_json, $created_at, $updated_at)
         ON CONFLICT(id) DO UPDATE SET
           conversation_id = excluded.conversation_id,
           parent_id = excluded.parent_id,
           sender = excluded.sender,
           text = excluded.text,
           raw_json = excluded.raw_json,
           updated_at = excluded.updated_at`,
		)
		.run({
			$id: messageId,
			$conversation_id: params.conversationId,
			$external_uuid: params.externalUuid,
			$parent_id: parentId,
			$sender: params.sender,
			$text: params.text,
			$raw_json: params.rawJson,
			$created_at: params.createdAt,
			$updated_at: params.updatedAt,
		});

	if (params.replaceExisting ?? true) {
		deleteChunksForMessage(ctx, messageId);
	}

	const conversation = ctx.db
		.query<{ provider: string; title: string | null }, [string]>(
			"SELECT provider, title FROM conversations WHERE id = ?",
		)
		.get(params.conversationId);

	let count = 0;
	for (const [index, text] of chunkText(params.text).entries()) {
		const chunkId = `${messageId}:${index}`;
		ctx.db
			.query(
				`INSERT INTO chunks
             (id, conversation_id, message_id, chunk_index, text, token_count, created_at)
           VALUES
             ($id, $conversation_id, $message_id, $chunk_index, $text, $token_count, $created_at)`,
			)
			.run({
				$id: chunkId,
				$conversation_id: params.conversationId,
				$message_id: messageId,
				$chunk_index: index,
				$text: text,
				$token_count: Math.ceil(text.length / 4),
				$created_at: params.createdAt,
			});
		if (!params.skipFts) {
			ctx.db
				.query(
					`INSERT INTO memory_chunks_fts
               (chunk_id, text, conversation_id, message_id, title, provider, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					chunkId,
					text,
					params.conversationId,
					messageId,
					conversation?.title ?? "",
					conversation?.provider ?? params.provider,
					params.createdAt,
				);
		}
		count++;
	}

	return { messageId, chunks: count };
}

export function deleteChunksForMessage(
	ctx: MemoryStoreContext,
	messageId: string,
): void {
	const existing = ctx.db
		.query<{ id: string }, [string]>(
			"SELECT id FROM chunks WHERE message_id = ?",
		)
		.all(messageId);
	for (const row of existing) {
		ctx.db
			.query("DELETE FROM memory_chunks_fts WHERE chunk_id = ?")
			.run(row.id);
		ctx.db.query("DELETE FROM chunk_embeddings WHERE chunk_id = ?").run(row.id);
	}
	ctx.db.query("DELETE FROM chunks WHERE message_id = ?").run(messageId);
}

export function deleteContentForConversation(
	ctx: MemoryStoreContext,
	conversationId: string,
): void {
	const chunks = ctx.db
		.query<{ id: string }, [string]>(
			"SELECT id FROM chunks WHERE conversation_id = ?",
		)
		.all(conversationId);
	for (const chunk of chunks) {
		ctx.db
			.query("DELETE FROM memory_chunks_fts WHERE chunk_id = ?")
			.run(chunk.id);
		ctx.db
			.query("DELETE FROM chunk_embeddings WHERE chunk_id = ?")
			.run(chunk.id);
	}
	ctx.db
		.query("DELETE FROM messages WHERE conversation_id = ?")
		.run(conversationId);
	ctx.db
		.query("DELETE FROM chunks WHERE conversation_id = ?")
		.run(conversationId);
}

export function deleteBySourcePrefix(
	ctx: MemoryStoreContext,
	prefix: string,
): void {
	const rows = ctx.db
		.query<{ id: string }, [string]>(
			"SELECT id FROM conversations WHERE source LIKE ?",
		)
		.all(`${prefix}%`);
	for (const row of rows) {
		const chunks = ctx.db
			.query<{ id: string }, [string]>(
				"SELECT id FROM chunks WHERE conversation_id = ?",
			)
			.all(row.id);
		for (const chunk of chunks) {
			ctx.db
				.query("DELETE FROM memory_chunks_fts WHERE chunk_id = ?")
				.run(chunk.id);
			ctx.db
				.query("DELETE FROM chunk_embeddings WHERE chunk_id = ?")
				.run(chunk.id);
		}
		ctx.db.query("DELETE FROM conversations WHERE id = ?").run(row.id);
	}
}

export function prepareArchiveReindex(ctx: MemoryStoreContext): void {
	// The archive is the canonical source for provider transcript memory.
	// Reindexing removes prior archive/provider transcript rows in set-based
	// SQL and rebuilds FTS once at the end. This avoids minutes of row-by-row
	// FTS deletes/inserts on large live databases.
	ctx.db.exec(`
      DELETE FROM memory_chunks_fts;
      DELETE FROM chunk_embeddings;

      DELETE FROM chunks
      WHERE conversation_id IN (
        SELECT id FROM conversations
        WHERE source LIKE '${MEMORY_ARCHIVE_SOURCE_PREFIX.replace(/'/g, "''")}%'
           OR provider IN ('claude', 'gateway')
      );

      DELETE FROM messages
      WHERE conversation_id IN (
        SELECT id FROM conversations
        WHERE source LIKE '${MEMORY_ARCHIVE_SOURCE_PREFIX.replace(/'/g, "''")}%'
           OR provider IN ('claude', 'gateway')
      );

      DELETE FROM conversations
      WHERE source LIKE '${MEMORY_ARCHIVE_SOURCE_PREFIX.replace(/'/g, "''")}%'
         OR provider IN ('claude', 'gateway');
    `);
}

export function rebuildFts(ctx: MemoryStoreContext): void {
	ctx.db.exec(`
      DELETE FROM memory_chunks_fts;
      INSERT INTO memory_chunks_fts
        (chunk_id, text, conversation_id, message_id, title, provider, created_at)
      SELECT
        chunks.id,
        chunks.text,
        chunks.conversation_id,
        chunks.message_id,
        COALESCE(conversations.title, ""),
        conversations.provider,
        chunks.created_at
      FROM chunks
      JOIN conversations ON conversations.id = chunks.conversation_id;
    `);
}

export function checkpointWal(ctx: MemoryStoreContext): void {
	try {
		ctx.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
	} catch (err) {
		console.warn("[memory] WAL checkpoint failed after reindex:", err);
	}
}
