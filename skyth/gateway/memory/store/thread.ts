import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_MEMORY_ROOT } from "@/gateway/memory/archive.ts";
import type { MemoryStoreContext } from "@/gateway/memory/store/context.ts";
import type {
	ThreadHandoffResult,
	ThreadMessageView,
	ThreadReadResult,
	ThreadSearchHit,
} from "@/gateway/memory/store/types.ts";
import {
	blobToVector,
	claudeConversationId,
	dot,
	ftsQuery,
	normalizeText,
	normalizeVector,
	publicThreadId,
	retrievalQueryText,
	safeFilePart,
	stableId,
	nowIso,
} from "@/gateway/memory/store/helpers.ts";
import {
	embeddingSearchConfig,
	embedTexts,
} from "@/gateway/memory/store/embeddings.ts";
import { upsertGatewayTurn } from "@/gateway/memory/store/gateway-turns.ts";

export function readThread(
	ctx: MemoryStoreContext,
	options: {
		threadId: string;
		mode?: "all" | "head" | "tail" | "range";
		start?: number;
		limit?: number;
		maxCharsPerMessage?: number;
	},
): ThreadReadResult {
	const conversationId = resolveThreadConversationId(ctx, options.threadId);
	const conversation = ctx.db
		.query<
			{
				id: string;
				external_uuid: string | null;
				title: string | null;
				summary: string | null;
				created_at: string | null;
				updated_at: string | null;
			},
			[string]
		>(
			"SELECT id, external_uuid, title, summary, created_at, updated_at FROM conversations WHERE id = ?",
		)
		.get(conversationId);
	if (!conversation) throw new Error(`Thread not found: ${options.threadId}`);

	const messages = threadMessages(
		ctx,
		conversationId,
		options.maxCharsPerMessage,
	);
	const mode = options.mode ?? "all";
	const limit = Math.max(
		1,
		Math.min(
			500,
			options.limit ?? (mode === "all" ? messages.length || 1 : 20),
		),
	);
	let start = Math.max(0, options.start ?? 0);
	if (mode === "tail") start = Math.max(0, messages.length - limit);
	if (mode === "head") start = 0;
	const selected = messages.slice(
		start,
		mode === "all" ? undefined : start + limit,
	);
	return {
		threadId: publicThreadId(conversation.id, conversation.external_uuid),
		conversationId: conversation.id,
		title: conversation.title ?? "(untitled)",
		summary: conversation.summary ?? "",
		createdAt: conversation.created_at,
		updatedAt: conversation.updated_at,
		totalMessages: messages.length,
		returnedMessages: selected.length,
		range: { start, end: start + selected.length },
		messages: selected,
	};
}

export async function searchThread(
	ctx: MemoryStoreContext,
	options: {
		threadId: string;
		query: string;
		limit?: number;
		mode?: "auto" | "semantic" | "bm25";
	},
): Promise<ThreadSearchHit[]> {
	const conversationId = resolveThreadConversationId(ctx, options.threadId);
	const limit = Math.max(1, Math.min(50, options.limit ?? 10));
	const mode = options.mode ?? "auto";
	if (mode === "bm25")
		return searchThreadBm25(ctx, conversationId, options.query, limit);
	if (mode === "semantic")
		return searchThreadSemantic(ctx, conversationId, options.query, limit);
	const config = embeddingSearchConfig(ctx);
	return config
		? searchThreadSemantic(ctx, conversationId, options.query, limit)
		: searchThreadBm25(ctx, conversationId, options.query, limit);
}

export function writeThreadHandoff(
	ctx: MemoryStoreContext,
	options: {
		threadId: string;
		summary: string;
		nextPrompt?: string;
		title?: string;
		metadata?: Record<string, unknown>;
	},
): ThreadHandoffResult {
	const conversationId = resolveThreadConversationId(ctx, options.threadId);
	const conversation = ctx.db
		.query<
			{ id: string; external_uuid: string | null; title: string | null },
			[string]
		>("SELECT id, external_uuid, title FROM conversations WHERE id = ?")
		.get(conversationId);
	if (!conversation) throw new Error(`Thread not found: ${options.threadId}`);
	if (!options.summary?.trim()) throw new Error("summary is required");

	const handoffId = stableId([
		"handoff",
		conversationId,
		nowIso(),
		options.summary,
	]);
	const dir = join(DEFAULT_MEMORY_ROOT, "handoffs");
	mkdirSync(dir, { recursive: true });
	const path = join(
		dir,
		`${new Date().toISOString().slice(0, 10)}-${safeFilePart(publicThreadId(conversation.id, conversation.external_uuid))}-${handoffId}.json`,
	);
	const payload = {
		type: "thread_handoff",
		handoffId,
		threadId: publicThreadId(conversation.id, conversation.external_uuid),
		conversationId,
		title: options.title ?? conversation.title ?? "",
		summary: options.summary,
		nextPrompt: options.nextPrompt ?? "",
		metadata: options.metadata ?? {},
		createdAt: nowIso(),
	};
	const text = JSON.stringify(payload, null, 2);
	writeFileSync(path, text, "utf8");
	upsertGatewayTurn(ctx, {
		channel: "thread",
		chatId: publicThreadId(conversation.id, conversation.external_uuid),
		assistantText: `THREAD HANDOFF\n${options.summary}${options.nextPrompt ? `\n\nNEXT PROMPT\n${options.nextPrompt}` : ""}`,
		traceId: `handoff:${handoffId}`,
		source: `handoff:${path}`,
		archiveRaw: false,
	});
	return {
		handoffId,
		threadId: publicThreadId(conversation.id, conversation.external_uuid),
		conversationId,
		path,
		chars: text.length,
	};
}

export function threadMessages(
	ctx: MemoryStoreContext,
	conversationId: string,
	maxCharsPerMessage?: number,
): ThreadMessageView[] {
	const maxChars = Math.max(200, Math.min(50_000, maxCharsPerMessage ?? 8_000));
	const rows = ctx.db
		.query<
			{
				id: string;
				external_uuid: string;
				sender: string;
				text: string;
				created_at: string | null;
				updated_at: string | null;
			},
			[string]
		>(
			`SELECT id, external_uuid, sender, text, created_at, updated_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY COALESCE(created_at, ""), id`,
		)
		.all(conversationId);
	return rows.map((row, index) => ({
		index,
		messageId: row.id,
		externalUuid: row.external_uuid,
		sender: row.sender,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		text:
			row.text.length > maxChars
				? `${row.text.slice(0, maxChars)}\n[truncated ${row.text.length - maxChars} chars]`
				: row.text,
	}));
}

export function resolveThreadConversationId(
	ctx: MemoryStoreContext,
	threadId: string,
): string {
	const trimmed = threadId.trim();
	if (trimmed === "current" || trimmed === "active" || trimmed === "latest") {
		const row = ctx.db
			.query<{ id: string }, []>(
				`SELECT id
           FROM conversations
           WHERE provider = "claude"
           ORDER BY COALESCE(updated_at, created_at, "") DESC
           LIMIT 1`,
			)
			.get();
		if (!row) throw new Error("No Claude threads are indexed yet");
		return row.id;
	}
	return claudeConversationId(threadId);
}

export function messageIndexMap(
	ctx: MemoryStoreContext,
	conversationId: string,
): Map<string, number> {
	const map = new Map<string, number>();
	for (const msg of threadMessages(ctx, conversationId, 200)) {
		map.set(msg.messageId, msg.index);
	}
	return map;
}

export function searchThreadBm25(
	ctx: MemoryStoreContext,
	conversationId: string,
	query: string,
	limit: number,
): ThreadSearchHit[] {
	const q = ftsQuery(query);
	if (!q) return [];
	const index = messageIndexMap(ctx, conversationId);
	const rows = ctx.db
		.query<
			{
				chunk_id: string;
				message_id: string;
				sender: string;
				created_at: string | null;
				text: string;
				snippet: string;
				rank: number;
			},
			[string, string, number]
		>(
			`SELECT
           f.chunk_id,
           f.message_id,
           m.sender,
           f.created_at,
           f.text,
           snippet(memory_chunks_fts, 1, "[", "]", "...", 18) AS snippet,
           bm25(memory_chunks_fts) AS rank
         FROM memory_chunks_fts f
         JOIN messages m ON m.id = f.message_id
         WHERE memory_chunks_fts MATCH ? AND f.conversation_id = ?
         ORDER BY rank
         LIMIT ?`,
		)
		.all(q, conversationId, limit);
	return rows.map((row) => ({
		chunkId: row.chunk_id,
		messageId: row.message_id,
		messageIndex: index.get(row.message_id) ?? null,
		sender: row.sender,
		createdAt: row.created_at,
		score: 1 / (1 + Math.max(0, row.rank)),
		text: row.text,
		snippet: row.snippet || normalizeText(row.text).slice(0, 240),
	}));
}

export async function searchThreadSemantic(
	ctx: MemoryStoreContext,
	conversationId: string,
	query: string,
	limit: number,
): Promise<ThreadSearchHit[]> {
	const config = embeddingSearchConfig(ctx);
	if (!config) return searchThreadBm25(ctx, conversationId, query, limit);
	const [queryEmbedding] = await embedTexts(ctx, [retrievalQueryText(query)], {
		provider: config.provider,
		model: config.model,
		dim: config.dim,
		inputMode: "query",
	});
	if (!queryEmbedding)
		return searchThreadBm25(ctx, conversationId, query, limit);
	const qv = normalizeVector(queryEmbedding).values;
	const index = messageIndexMap(ctx, conversationId);
	const rows = ctx.db
		.query<
			{
				chunk_id: string;
				embedding: Buffer;
				message_id: string;
				sender: string;
				created_at: string | null;
				text: string;
			},
			[string, number, string]
		>(
			`SELECT e.chunk_id, e.embedding, c.message_id, m.sender, c.created_at, c.text
         FROM chunk_embeddings e
         JOIN chunks c ON c.id = e.chunk_id
         JOIN messages m ON m.id = c.message_id
         WHERE e.model = ? AND e.dim = ? AND c.conversation_id = ?`,
		)
		.all(config.model, config.dim, conversationId);
	return rows
		.map((row) => {
			const score = dot(qv, blobToVector(row.embedding));
			return {
				chunkId: row.chunk_id,
				messageId: row.message_id,
				messageIndex: index.get(row.message_id) ?? null,
				sender: row.sender,
				createdAt: row.created_at,
				score,
				text: row.text,
				snippet: normalizeText(row.text).slice(0, 320),
			};
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}
