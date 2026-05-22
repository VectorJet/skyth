//! Durable run/session event service for agent run events.
//!
//! Stores per-run event records so the gateway no longer needs to
//! persist hybrid run events through the VFS JSON path. Each row keeps
//! the run id, optional step index, an explicit sequence number, the
//! event type and the raw event payload as JSON.

use crate::db::QuasarDb;
use crate::error::Result;
use rusqlite::params;
use serde::{Deserialize, Serialize};

pub const RUN_EVENTS_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS run_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_unix_ms  INTEGER NOT NULL,
    actor       TEXT NOT NULL,
    run_id      TEXT NOT NULL,
    thread_id   TEXT,
    step_index  INTEGER,
    sequence    INTEGER NOT NULL,
    event_type  TEXT NOT NULL,
    payload     TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS run_events_run_seq_idx
ON run_events(run_id, sequence);

CREATE INDEX IF NOT EXISTS run_events_run_ts_idx
ON run_events(run_id, ts_unix_ms);
"#;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RunEventRow {
    pub id: i64,
    pub ts_unix_ms: i64,
    pub actor: String,
    pub run_id: String,
    pub thread_id: Option<String>,
    pub step_index: Option<i64>,
    pub sequence: i64,
    pub event_type: String,
    pub payload: serde_json::Value,
}

pub struct RunEventStore<'a> {
    db: &'a QuasarDb,
}

impl<'a> RunEventStore<'a> {
    pub fn new(db: &'a QuasarDb) -> Result<Self> {
        let conn = db.conn();
        conn.execute_batch(RUN_EVENTS_SCHEMA)?;
        drop(conn);
        Ok(Self { db })
    }

    pub fn record(
        &self,
        actor: &str,
        run_id: &str,
        thread_id: Option<&str>,
        step_index: Option<i64>,
        sequence: i64,
        event_type: &str,
        payload: serde_json::Value,
    ) -> Result<i64> {
        let ts = chrono::Utc::now().timestamp_millis();
        let conn = self.db.conn();
        conn.execute(
            "INSERT INTO run_events
             (ts_unix_ms, actor, run_id, thread_id, step_index, sequence, event_type, payload)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                ts,
                actor,
                run_id,
                thread_id,
                step_index,
                sequence,
                event_type,
                serde_json::to_string(&payload)?,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn list_for_run(&self, run_id: &str) -> Result<Vec<RunEventRow>> {
        let conn = self.db.conn();
        let mut stmt = conn.prepare(
            "SELECT id, ts_unix_ms, actor, run_id, thread_id, step_index,
                    sequence, event_type, payload
             FROM run_events
             WHERE run_id = ?1
             ORDER BY sequence ASC, id ASC",
        )?;
        stmt.query_map(params![run_id], |row| {
            let payload_str: String = row.get(8)?;
            Ok(RunEventRow {
                id: row.get(0)?,
                ts_unix_ms: row.get(1)?,
                actor: row.get(2)?,
                run_id: row.get(3)?,
                thread_id: row.get(4)?,
                step_index: row.get(5)?,
                sequence: row.get(6)?,
                event_type: row.get(7)?,
                payload: serde_json::from_str(&payload_str)
                    .unwrap_or(serde_json::Value::Null),
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Into::into)
    }
}
