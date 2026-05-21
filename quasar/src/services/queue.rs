//! Durable gateway queue service.
//!
//! Queue state is stored in an opened quasardb so the gateway can stop being
//! the durable authority while preserving claim/ack crash-recovery semantics.

use crate::db::QuasarDb;
use crate::error::Result;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

pub const QUEUE_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS gateway_queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT NOT NULL CHECK(kind IN ('user', 'gateway')),
    payload     TEXT NOT NULL,
    tag         TEXT,
    ts          INTEGER NOT NULL,
    enqueued_at INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','inflight','done'))
) STRICT;

CREATE INDEX IF NOT EXISTS gateway_queue_status_kind_idx
ON gateway_queue(status, kind, id);
"#;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QueueRow {
    pub id: i64,
    pub kind: String,
    pub payload: String,
    pub tag: Option<String>,
    pub ts: i64,
    pub enqueued_at: i64,
    pub status: String,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct QueueStats {
    pub user: i64,
    pub gateway: i64,
}

pub struct Queue<'a> {
    db: &'a QuasarDb,
}

impl<'a> Queue<'a> {
    pub fn new(db: &'a QuasarDb) -> Result<Self> {
        let conn = db.conn();
        conn.execute_batch(QUEUE_SCHEMA)?;
        drop(conn);
        Ok(Self { db })
    }

    pub fn push_user(&self, payload: &str, ts: i64, enqueued_at: i64) -> Result<i64> {
        let conn = self.db.conn();
        conn.execute(
            "INSERT INTO gateway_queue (kind, payload, tag, ts, enqueued_at)
             VALUES ('user', ?1, NULL, ?2, ?3)",
            params![payload, ts, enqueued_at],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn push_gateway(
        &self,
        payload: &str,
        tag: Option<&str>,
        ts: i64,
        enqueued_at: i64,
    ) -> Result<i64> {
        let mut conn = self.db.conn();
        let tx = conn.transaction()?;
        if let Some(tag) = tag {
            tx.execute(
                "DELETE FROM gateway_queue
                 WHERE kind='gateway' AND status='pending' AND tag=?1",
                params![tag],
            )?;
        }
        tx.execute(
            "INSERT INTO gateway_queue (kind, payload, tag, ts, enqueued_at)
             VALUES ('gateway', ?1, ?2, ?3, ?4)",
            params![payload, tag, ts, enqueued_at],
        )?;
        let id = tx.last_insert_rowid();
        tx.commit()?;
        Ok(id)
    }

    pub fn claim_all(&self) -> Result<Vec<QueueRow>> {
        let mut conn = self.db.conn();
        let tx = conn.transaction()?;
        let rows = {
            let mut stmt = tx.prepare(
                "SELECT id, kind, payload, tag, ts, enqueued_at, status
                 FROM gateway_queue
                 WHERE status='pending'
                 ORDER BY id ASC",
            )?;
            stmt.query_map([], row_from_sql)?
                .collect::<std::result::Result<Vec<_>, _>>()?
        };
        if !rows.is_empty() {
            let ids = rows
                .iter()
                .map(|row| row.id.to_string())
                .collect::<Vec<_>>()
                .join(",");
            tx.execute(
                &format!("UPDATE gateway_queue SET status='inflight' WHERE id IN ({ids})"),
                [],
            )?;
        }
        tx.commit()?;
        Ok(rows)
    }

    pub fn mark_done(&self, ids: &[i64]) -> Result<()> {
        self.update_status(ids, "done")
    }

    pub fn release_inflight(&self, ids: &[i64]) -> Result<()> {
        self.update_status(ids, "pending")
    }

    pub fn pending_stats(&self) -> Result<QueueStats> {
        let conn = self.db.conn();
        let user = count_pending(&conn, "user")?;
        let gateway = count_pending(&conn, "gateway")?;
        Ok(QueueStats { user, gateway })
    }

    fn update_status(&self, ids: &[i64], status: &str) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let id_list = ids
            .iter()
            .map(|id| id.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let conn = self.db.conn();
        conn.execute(
            &format!("UPDATE gateway_queue SET status=?1 WHERE id IN ({id_list})"),
            params![status],
        )?;
        Ok(())
    }
}

fn row_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<QueueRow> {
    Ok(QueueRow {
        id: row.get(0)?,
        kind: row.get(1)?,
        payload: row.get(2)?,
        tag: row.get(3)?,
        ts: row.get(4)?,
        enqueued_at: row.get(5)?,
        status: row.get(6)?,
    })
}

fn count_pending(conn: &rusqlite::Connection, kind: &str) -> Result<i64> {
    Ok(conn
        .query_row(
            "SELECT count(*) FROM gateway_queue WHERE status='pending' AND kind=?1",
            params![kind],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(0))
}
