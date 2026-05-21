//! Durable state-transition service.

use crate::db::QuasarDb;
use crate::error::Result;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

pub const STATE_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS state_transitions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_unix_ms  INTEGER NOT NULL,
    actor       TEXT NOT NULL,
    domain      TEXT NOT NULL,
    from_state  TEXT,
    to_state    TEXT NOT NULL,
    reason      TEXT,
    metadata    TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS state_transitions_domain_ts_idx
ON state_transitions(domain, ts_unix_ms);
"#;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StateTransition {
    pub id: i64,
    pub ts_unix_ms: i64,
    pub actor: String,
    pub domain: String,
    pub from_state: Option<String>,
    pub to_state: String,
    pub reason: Option<String>,
    pub metadata: serde_json::Value,
}

pub struct StateStore<'a> {
    db: &'a QuasarDb,
}

impl<'a> StateStore<'a> {
    pub fn new(db: &'a QuasarDb) -> Result<Self> {
        let conn = db.conn();
        conn.execute_batch(STATE_SCHEMA)?;
        drop(conn);
        Ok(Self { db })
    }

    pub fn record(
        &self,
        actor: &str,
        domain: &str,
        from_state: Option<&str>,
        to_state: &str,
        reason: Option<&str>,
        metadata: serde_json::Value,
    ) -> Result<i64> {
        let ts = chrono::Utc::now().timestamp_millis();
        let conn = self.db.conn();
        conn.execute(
            "INSERT INTO state_transitions
             (ts_unix_ms, actor, domain, from_state, to_state, reason, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                ts,
                actor,
                domain,
                from_state,
                to_state,
                reason,
                serde_json::to_string(&metadata)?,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn latest(&self, domain: &str) -> Result<Option<StateTransition>> {
        let conn = self.db.conn();
        conn.query_row(
            "SELECT id, ts_unix_ms, actor, domain, from_state, to_state, reason, metadata
             FROM state_transitions
             WHERE domain=?1
             ORDER BY ts_unix_ms DESC, id DESC
             LIMIT 1",
            params![domain],
            transition_from_row,
        )
        .optional()
        .map_err(Into::into)
    }
}

fn transition_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StateTransition> {
    let metadata: String = row.get(7)?;
    Ok(StateTransition {
        id: row.get(0)?,
        ts_unix_ms: row.get(1)?,
        actor: row.get(2)?,
        domain: row.get(3)?,
        from_state: row.get(4)?,
        to_state: row.get(5)?,
        reason: row.get(6)?,
        metadata: serde_json::from_str(&metadata).unwrap_or(serde_json::Value::Null),
    })
}
