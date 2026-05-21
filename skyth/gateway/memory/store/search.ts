import type { MemoryStoreContext } from "@/gateway/memory/store/context.ts";
import type {
	MemorySearchHit,
	SessionSearchHit,
} from "@/gateway/memory/store/types.ts";
import {
	blobToVector,
	dot,
	ftsQuery,
	normalizeText,
	normalizeVector,
	publicThreadId,
	retrievalQueryText,
	safeJsonObject,
} from "@/gateway/memory/store/helpers.ts";
import {
	embeddingSearchConfig,
	embedTexts,
} from "@/gateway/memory/store/embeddings.ts";

export function searchMemory(
	ctx: MemoryStoreContext,
	query: string,
	limit = 5,
): MemorySearchHit[] {
	const q = ftsQuery(query);
	if (!q) return [];
	const rows = ctx.db
		.query<
			{
				chunk_id: string;
				conversation_id: string;
				external_uuid: string | null;
				message_id: string;
				provider: string;
				title: string | null;
				sender: string;
				created_at: string | null;
				text: string;
				snippet: string;
				rank: number;
			},
			[string, number]
		>(
			`SELECT
           f.chunk_id,
           f.conversation_id,
           conv.external_uuid,
           f.message_id,
           f.provider,
           f.title,
           m.sender,
           f.created_at,
           f.text,
           snippet(memory_chunks_fts, 1, "[", "]", "...", 18) AS snippet,
           bm25(memory_chunks_fts) AS rank
         FROM memory_chunks_fts f
         JOIN messages m ON m.id = f.message_id
         JOIN conversations conv ON conv.id = f.conversation_id
         WHERE memory_chunks_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
		)
		.all(q, Math.max(1, Math.min(20, limit)));

	return rows.map((row) => ({
		chunkId: row.chunk_id,
		conversationId: row.conversation_id,
		threadId: publicThreadId(row.conversation_id, row.external_uuid),
		messageId: row.message_id,
		provider: row.provider,
		title: row.title ?? "(untitled)",
		sender: row.sender,
		createdAt: row.created_at,
		rank: row.rank,
		score: 1 / (1 + Math.max(0, row.rank)),
		text: row.text,
		snippet: row.snippet || normalizeText(row.text).slice(0, 240),
	}));
}

export async function searchMemorySemantic(
	ctx: MemoryStoreContext,
	query: string,
	limit = 5,
): Promise<MemorySearchHit[]> {
	const config = embeddingSearchConfig(ctx);
	if (!config) return searchMemory(ctx, query, limit);

	const [queryEmbedding] = await embedTexts(ctx, [retrievalQueryText(query)], {
		provider: config.provider,
		model: config.model,
		dim: config.dim,
		inputMode: "query",
	});
	if (!queryEmbedding) return searchMemory(ctx, query, limit);
	const qv = normalizeVector(queryEmbedding).values;

	const rows = ctx.db
		.query<
			{
				chunk_id: string;
				embedding: Buffer;
				conversation_id: string;
				external_uuid: string | null;
				message_id: string;
				provider: string;
				title: string | null;
				sender: string;
				created_at: string | null;
				text: string;
			},
			[string, number]
		>(
			`SELECT
           e.chunk_id,
           e.embedding,
           c.conversation_id,
           conv.external_uuid,
           c.message_id,
           conv.provider,
           conv.title,
           m.sender,
           c.created_at,
           c.text
         FROM chunk_embeddings e
         JOIN chunks c ON c.id = e.chunk_id
         JOIN messages m ON m.id = c.message_id
         JOIN conversations conv ON conv.id = c.conversation_id
         WHERE e.model = ? AND e.dim = ?`,
		)
		.all(config.model, config.dim);

	return rows
		.map((row) => {
			const score = dot(qv, blobToVector(row.embedding));
			return {
				chunkId: row.chunk_id,
				conversationId: row.conversation_id,
				threadId: publicThreadId(row.conversation_id, row.external_uuid),
				messageId: row.message_id,
				provider: row.provider,
				title: row.title ?? "(untitled)",
				sender: row.sender,
				createdAt: row.created_at,
				rank: -score,
				score,
				text: row.text,
				snippet: normalizeText(row.text).slice(0, 320),
			};
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, Math.max(1, Math.min(20, limit)));
}

export async function searchMemoryAuto(
	ctx: MemoryStoreContext,
	query: string,
	limit = 5,
	mode: "auto" | "semantic" | "bm25" = "auto",
): Promise<MemorySearchHit[]> {
	if (mode === "bm25") return searchMemory(ctx, query, limit);
	if (mode === "semantic") return searchMemorySemantic(ctx, query, limit);
	const config = embeddingSearchConfig(ctx);
	if (!config) return searchMemory(ctx, query, limit);
	const chunks =
		ctx.db.query<{ n: number }, []>("SELECT count(*) AS n FROM chunks").get()
			?.n ?? 0;
	const threshold = Number(
		process.env.CLAUDE_GATEWAY_SEMANTIC_AUTO_MIN_COVERAGE ?? 0.9,
	);
	return chunks > 0 && config.count / chunks >= threshold
		? searchMemorySemantic(ctx, query, limit)
		: searchMemory(ctx, query, limit);
}

export async function searchSessions(
	ctx: MemoryStoreContext,
	options: {
		query?: string;
		limit?: number;
		sort?:
			| "relevance"
			| "updated_desc"
			| "updated_asc"
			| "created_desc"
			| "created_asc"
			| "name_asc"
			| "name_desc"
			| "messages_desc";
	} = {},
): Promise<SessionSearchHit[]> {
	const limit = Math.max(1, Math.min(50, options.limit ?? 10));
	const sort =
		options.sort ?? (options.query?.trim() ? "relevance" : "updated_desc");
	const rows = ctx.db
		.query<
			{
				id: string;
				external_uuid: string | null;
				title: string | null;
				summary: string | null;
				raw_json: string | null;
				created_at: string | null;
				updated_at: string | null;
				message_count: number;
				chunk_count: number;
			},
			[]
		>(
			`SELECT
           conv.id,
           conv.external_uuid,
           conv.title,
           conv.summary,
           conv.raw_json,
           conv.created_at,
           conv.updated_at,
           count(DISTINCT m.id) AS message_count,
           count(DISTINCT c.id) AS chunk_count
         FROM conversations conv
         LEFT JOIN messages m ON m.conversation_id = conv.id
         LEFT JOIN chunks c ON c.conversation_id = conv.id
         WHERE conv.provider = "claude"
         GROUP BY conv.id`,
		)
		.all();

	const scores = new Map<string, { score: number; reason: string }>();
	const query = options.query?.trim();
	if (query) {
		const lowered = query.toLowerCase();
		for (const row of rows) {
			const haystack = `${row.title ?? ""}\n${row.summary ?? ""}`.toLowerCase();
			if (haystack.includes(lowered)) {
				scores.set(row.id, {
					score: Math.max(scores.get(row.id)?.score ?? 0, 2),
					reason: "title/summary",
				});
			}
		}
		for (const hit of await searchMemoryAuto(
			ctx,
			query,
			Math.max(limit * 4, 20),
			"auto",
		)) {
			const existing = scores.get(hit.conversationId);
			const score = hit.score + 1;
			if (!existing || score > existing.score) {
				scores.set(hit.conversationId, {
					score,
					reason: `memory:${hit.sender}`,
				});
			}
		}
	}

	const out = rows
		.map((row) => {
			const raw = safeJsonObject(row.raw_json);
			const model = typeof raw?.model === "string" ? raw.model : null;
			const scored = scores.get(row.id);
			return {
				threadId: publicThreadId(row.id, row.external_uuid),
				conversationId: row.id,
				title: row.title ?? "(untitled)",
				summary: row.summary ?? "",
				model,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
				messageCount: row.message_count,
				chunkCount: row.chunk_count,
				score: scored?.score ?? 0,
				matchReason: scored?.reason ?? (query ? "none" : "list"),
			};
		})
		.filter((row) => !query || row.score > 0);

	out.sort((a, b) => {
		if (sort === "relevance")
			return (
				b.score - a.score ||
				String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))
			);
		if (sort === "updated_asc")
			return String(a.updatedAt ?? "").localeCompare(String(b.updatedAt ?? ""));
		if (sort === "created_desc")
			return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
		if (sort === "created_asc")
			return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
		if (sort === "name_asc") return a.title.localeCompare(b.title);
		if (sort === "name_desc") return b.title.localeCompare(a.title);
		if (sort === "messages_desc") return b.messageCount - a.messageCount;
		return String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
	});
	return out.slice(0, limit);
}
