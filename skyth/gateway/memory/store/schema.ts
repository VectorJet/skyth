import { existsSync } from "node:fs";
import {
	getLoadablePath as getSqliteVecLoadablePath,
	load as loadSqliteVec,
} from "sqlite-vec";
import type { MemoryStoreContext } from "@/gateway/memory/store/context.ts";

export function migrate(ctx: MemoryStoreContext): void {
	ctx.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        external_uuid TEXT,
        title TEXT,
        summary TEXT,
        created_at TEXT,
        updated_at TEXT,
        source TEXT NOT NULL,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        external_uuid TEXT,
        parent_id TEXT,
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        raw_json TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        token_count INTEGER,
        created_at TEXT,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chunk_embeddings (
        chunk_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        dim INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        norm REAL NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(chunk_id, model, dim),
        FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(
        chunk_id UNINDEXED,
        text,
        conversation_id UNINDEXED,
        message_id UNINDEXED,
        title UNINDEXED,
        provider UNINDEXED,
        created_at UNINDEXED
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_message ON chunks(message_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_conversation ON chunks(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_model_dim ON chunk_embeddings(model, dim);
    `);
}

export function tryLoadVectorExtension(
	ctx: MemoryStoreContext,
	vectorLoaded: { value: boolean },
): void {
	const extensionPath = process.env.CLAUDE_GATEWAY_SQLITE_VEC_EXTENSION;
	if (extensionPath) {
		if (!existsSync(extensionPath)) {
			console.warn(
				`[memory] SQLite vector extension path does not exist: ${extensionPath}`,
			);
			return;
		}
		try {
			ctx.db.loadExtension(extensionPath);
			vectorLoaded.value = true;
			console.log(`[memory] loaded SQLite vector extension: ${extensionPath}`);
			return;
		} catch (err) {
			console.warn(
				"[memory] failed to load SQLite vector extension from CLAUDE_GATEWAY_SQLITE_VEC_EXTENSION:",
				err,
			);
		}
	}

	try {
		loadSqliteVec(ctx.db);
		vectorLoaded.value = true;
		console.log(
			`[memory] loaded bundled sqlite-vec extension: ${getSqliteVecLoadablePath()}`,
		);
	} catch (err) {
		console.warn("[memory] failed to load bundled sqlite-vec extension:", err);
	}
}
