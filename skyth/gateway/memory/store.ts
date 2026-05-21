import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { envFirst, SKYTH_HOME } from "@/gateway/config/env.ts";
import { archiveStats } from "@/gateway/memory/archive.ts";
import type {
	ClaudeExportConversation,
	ClaudeSessionMetadata,
	EmbedMemoryOptions,
	EmbedMemoryResult,
	GatewayTurnRecord,
	MemorySearchHit,
	SessionSearchHit,
	ThreadHandoffResult,
	ThreadReadResult,
	ThreadSearchHit,
} from "@/gateway/memory/store/types.ts";
import type { MemoryStoreContext } from "@/gateway/memory/store/context.ts";
import { reconstructBranch } from "@/gateway/memory/store/helpers.ts";
import {
	migrate,
	tryLoadVectorExtension,
} from "@/gateway/memory/store/schema.ts";
import {
	embeddingSearchConfig,
	embedMissingChunks,
} from "@/gateway/memory/store/embeddings.ts";
import {
	importClaudeExportFile,
	importClaudeExport,
	upsertClaudeConversation,
	upsertClaudeSessionMetadata,
} from "@/gateway/memory/store/imports.ts";
import { upsertGatewayTurn } from "@/gateway/memory/store/gateway-turns.ts";
import { reindexArchive } from "@/gateway/memory/store/reindex.ts";
import {
	searchMemory,
	searchMemorySemantic,
	searchMemoryAuto,
	searchSessions,
} from "@/gateway/memory/store/search.ts";
import {
	readThread,
	searchThread,
	writeThreadHandoff,
} from "@/gateway/memory/store/thread.ts";
import { buildRagHint, buildRagBlock } from "@/gateway/memory/store/rag.ts";

export type * from "@/gateway/memory/store/types.ts";
const DEFAULT_DB_PATH =
	envFirst("SKYTH_GATEWAY_MEMORY_DB", "CLAUDE_GATEWAY_MEMORY_DB") ??
	join(SKYTH_HOME, "gateway", "memory", "memory.sqlite");
export class MemoryStore {
	readonly dbPath: string;
	private db: Database;
	private vectorLoaded = false;
	constructor(dbPath: string = DEFAULT_DB_PATH) {
		this.dbPath = dbPath;
		mkdirSync(dirname(dbPath), { recursive: true });
		this.db = new Database(dbPath);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec("PRAGMA foreign_keys = ON");
		migrate(this.context());
		const loaded = { value: false };
		tryLoadVectorExtension(this.context(), loaded);
		this.vectorLoaded = loaded.value;
	}
	private context(): MemoryStoreContext {
		return { db: this.db, dbPath: this.dbPath };
	}
	close(): void {
		this.db.close();
	}
	stats() {
		const conversations =
			this.db
				.query<{ n: number }, []>("SELECT count(*) AS n FROM conversations")
				.get()?.n ?? 0;
		const messages =
			this.db
				.query<{ n: number }, []>("SELECT count(*) AS n FROM messages")
				.get()?.n ?? 0;
		const chunks =
			this.db.query<{ n: number }, []>("SELECT count(*) AS n FROM chunks").get()
				?.n ?? 0;
		const embeddings =
			this.db
				.query<{ n: number }, []>("SELECT count(*) AS n FROM chunk_embeddings")
				.get()?.n ?? 0;
		const activeEmbedding = embeddingSearchConfig(this.context());
		const activeEmbeddingCount = activeEmbedding?.count ?? 0;
		return {
			dbPath: this.dbPath,
			archive: archiveStats(),
			conversations,
			messages,
			chunks,
			embeddings,
			activeEmbeddingModel: activeEmbedding?.model ?? null,
			activeEmbeddingDim: activeEmbedding?.dim ?? null,
			activeEmbeddingProvider: activeEmbedding?.provider ?? null,
			activeEmbeddingCount,
			activeEmbeddingCoverage: chunks > 0 ? activeEmbeddingCount / chunks : 0,
			vectorExtensionLoaded: this.vectorLoaded,
			vectorLoaded: this.vectorLoaded,
		};
	}
	importClaudeExportFile(filePath: string, source?: string) {
		return importClaudeExportFile(this.context(), filePath, source);
	}
	importClaudeExport(
		input: unknown,
		source?: string,
		options?: {
			archiveRaw?: boolean;
			skipFts?: boolean;
			replaceExisting?: boolean;
		},
	) {
		return importClaudeExport(this.context(), input, source, options);
	}
	upsertClaudeConversation(
		conversation: ClaudeExportConversation,
		source?: string,
		options?: {
			archiveRaw?: boolean;
			skipFts?: boolean;
			replaceExisting?: boolean;
		},
	) {
		return upsertClaudeConversation(
			this.context(),
			conversation,
			source,
			options,
		);
	}
	upsertClaudeSessionMetadata(
		input: ClaudeSessionMetadata | ClaudeSessionMetadata[],
	) {
		return upsertClaudeSessionMetadata(this.context(), input);
	}
	upsertGatewayTurn(record: GatewayTurnRecord) {
		return upsertGatewayTurn(this.context(), record);
	}
	reindexArchive(root?: string) {
		return reindexArchive(this.context(), root);
	}
	search(query: string, limit?: number): MemorySearchHit[] {
		return searchMemory(this.context(), query, limit);
	}
	searchSemantic(query: string, limit?: number): Promise<MemorySearchHit[]> {
		return searchMemorySemantic(this.context(), query, limit);
	}
	searchAuto(
		query: string,
		limit?: number,
		mode?: "auto" | "semantic" | "bm25",
	): Promise<MemorySearchHit[]> {
		return searchMemoryAuto(this.context(), query, limit, mode);
	}
	searchSessions(options?: {
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
	}): Promise<SessionSearchHit[]> {
		return searchSessions(this.context(), options);
	}
	readThread(options: {
		threadId: string;
		mode?: "all" | "head" | "tail" | "range";
		start?: number;
		limit?: number;
		maxCharsPerMessage?: number;
	}): ThreadReadResult {
		return readThread(this.context(), options);
	}
	searchThread(options: {
		threadId: string;
		query: string;
		limit?: number;
		mode?: "auto" | "semantic" | "bm25";
	}): Promise<ThreadSearchHit[]> {
		return searchThread(this.context(), options);
	}
	writeThreadHandoff(options: {
		threadId: string;
		summary: string;
		nextPrompt?: string;
		title?: string;
		metadata?: Record<string, unknown>;
	}): ThreadHandoffResult {
		return writeThreadHandoff(this.context(), options);
	}
	embedMissingChunks(options?: EmbedMemoryOptions): Promise<EmbedMemoryResult> {
		return embedMissingChunks(this.context(), options);
	}
	buildRagHint(query: string, limit?: number): Promise<string | null> {
		return buildRagHint(this.context(), query, limit);
	}
	buildRagBlock(
		query: string,
		limit?: number,
		maxChars?: number,
	): string | null {
		return buildRagBlock(this.context(), query, limit, maxChars);
	}
}
let singleton: MemoryStore | null = null;
export function getMemoryStore(): MemoryStore {
	if (!singleton) singleton = new MemoryStore();
	return singleton;
}
export function claudeBranchMessages(conversation: ClaudeExportConversation) {
	return reconstructBranch(conversation);
}
