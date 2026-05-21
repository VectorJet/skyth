/**
 * Persistent queue store backed by bun:sqlite. Survives gateway restarts so a
 * burst of Telegram messages mid-deploy isn't lost. The MessageRouter writes
 * every enqueue/push and removes items as it drains.
 */
import { Database } from "bun:sqlite";
import { dirname, join } from "path";
import { mkdirSync, existsSync } from "fs";
import { envFirst, SKYTH_HOME } from "@/gateway/config/env.ts";

export type QueueRowKind = "user" | "gateway";

export interface QueueRow {
	id: number;
	kind: QueueRowKind;
	payload: string; // JSON-encoded body (IncomingMessage or {body, tag})
	tag: string | null; // for gateway items (collapse key)
	ts: number;
	enqueuedAt: number;
	status: "pending" | "inflight" | "done";
}

export class QueueStore {
	private db: Database;

	constructor(dbPath?: string) {
		const path =
			dbPath ??
			envFirst("SKYTH_GATEWAY_QUEUE_DB", "CLAUDE_GATEWAY_QUEUE_DB") ??
			join(SKYTH_HOME, "gateway", "queue.db");
		if (!existsSync(dirname(path)))
			mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path);
		this.db.run(`
      CREATE TABLE IF NOT EXISTS queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK(kind IN ('user', 'gateway')),
        payload TEXT NOT NULL,
        tag TEXT,
        ts INTEGER NOT NULL,
        enqueued_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','inflight','done'))
      )
    `);
		this.db.run(
			`CREATE INDEX IF NOT EXISTS idx_queue_status_kind ON queue(status, kind, id)`,
		);
		// On boot, any 'inflight' row from a prior crash gets reset to pending so
		// we replay it instead of dropping.
		this.db.run(
			`UPDATE queue SET status = 'pending' WHERE status = 'inflight'`,
		);
	}

	pushUser(payload: unknown, ts: number) {
		this.db.run(
			`INSERT INTO queue (kind, payload, tag, ts, enqueued_at) VALUES ('user', ?, NULL, ?, ?)`,
			[JSON.stringify(payload), ts, Date.now()],
		);
	}

	pushGateway(body: string, tag?: string) {
		if (tag) {
			// Collapse: drop pending rows with the same tag.
			this.db.run(
				`DELETE FROM queue WHERE kind='gateway' AND status='pending' AND tag=?`,
				[tag],
			);
		}
		this.db.run(
			`INSERT INTO queue (kind, payload, tag, ts, enqueued_at) VALUES ('gateway', ?, ?, ?, ?)`,
			[JSON.stringify({ body }), tag ?? null, Date.now(), Date.now()],
		);
	}

	/** Atomically claim and return all pending rows. */
	claimAll(): QueueRow[] {
		const rows = this.db
			.query(
				`SELECT id, kind, payload, tag, ts, enqueued_at AS enqueuedAt, status
       FROM queue WHERE status='pending' ORDER BY id ASC`,
			)
			.all() as QueueRow[];
		if (rows.length === 0) return rows;
		const ids = rows.map((r) => r.id);
		this.db.run(
			`UPDATE queue SET status='inflight' WHERE id IN (${ids.map(() => "?").join(",")})`,
			ids,
		);
		return rows;
	}

	markDone(ids: number[]) {
		if (ids.length === 0) return;
		this.db.run(
			`UPDATE queue SET status='done' WHERE id IN (${ids.map(() => "?").join(",")})`,
			ids,
		);
	}

	releaseInflight(ids: number[]) {
		if (ids.length === 0) return;
		this.db.run(
			`UPDATE queue SET status='pending' WHERE id IN (${ids.map(() => "?").join(",")})`,
			ids,
		);
	}

	pendingStats() {
		const row = this.db
			.query(
				`SELECT
         SUM(kind='user') AS user,
         SUM(kind='gateway') AS gateway
       FROM queue WHERE status='pending'`,
			)
			.get() as { user: number | null; gateway: number | null } | null;
		return { user: Number(row?.user ?? 0), gateway: Number(row?.gateway ?? 0) };
	}
}
