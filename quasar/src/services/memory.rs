//! Durable memory service for gateway turns and retrieval hints.

use crate::db::QuasarDb;
use crate::error::Result;
use rusqlite::params;
use serde::{Deserialize, Serialize};

pub const MEMORY_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS memory_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_unix_ms  INTEGER NOT NULL,
    source      TEXT NOT NULL,
    thread_id   TEXT NOT NULL,
    role        TEXT NOT NULL,
    text        TEXT NOT NULL,
    metadata    TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS memory_records_thread_ts_idx
ON memory_records(thread_id, ts_unix_ms);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_records_fts USING fts5(
    text,
    source UNINDEXED,
    thread_id UNINDEXED,
    role UNINDEXED,
    content='memory_records',
    content_rowid='id'
);
"#;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemoryHit {
    pub id: i64,
    pub thread_id: String,
    pub source: String,
    pub role: String,
    pub text: String,
    pub snippet: String,
    pub rank: f64,
    pub ts_unix_ms: i64,
}

pub struct Memory<'a> {
    db: &'a QuasarDb,
}

impl<'a> Memory<'a> {
    pub fn new(db: &'a QuasarDb) -> Result<Self> {
        let conn = db.conn();
        conn.execute_batch(MEMORY_SCHEMA)?;
        drop(conn);
        Ok(Self { db })
    }

    pub fn record_gateway_turn(
        &self,
        channel: &str,
        chat_id: &str,
        user_text: Option<&str>,
        assistant_text: Option<&str>,
        user_message_id: Option<&str>,
        ts_unix_ms: i64,
    ) -> Result<Vec<i64>> {
        let thread_id = format!("gateway:{channel}:{chat_id}");
        let mut ids = Vec::new();
        if let Some(text) = user_text.filter(|text| !text.trim().is_empty()) {
            ids.push(self.insert_record(
                "gateway",
                &thread_id,
                "human",
                text,
                serde_json::json!({
                    "channel": channel,
                    "chatId": chat_id,
                    "userMessageId": user_message_id,
                }),
                ts_unix_ms,
            )?);
        }
        if let Some(text) = assistant_text.filter(|text| !text.trim().is_empty()) {
            ids.push(self.insert_record(
                "gateway",
                &thread_id,
                "assistant",
                text,
                serde_json::json!({
                    "channel": channel,
                    "chatId": chat_id,
                }),
                ts_unix_ms,
            )?);
        }
        Ok(ids)
    }

    pub fn search(&self, query: &str, limit: i64) -> Result<Vec<MemoryHit>> {
        let conn = self.db.conn();
        let escaped = fts_query(query);
        if escaped.is_empty() {
            return Ok(Vec::new());
        }
        let mut stmt = conn.prepare(
            "SELECT
                r.id,
                r.thread_id,
                r.source,
                r.role,
                r.text,
                snippet(memory_records_fts, 0, '[', ']', '...', 18),
                bm25(memory_records_fts),
                r.ts_unix_ms
             FROM memory_records_fts
             JOIN memory_records r ON r.id = memory_records_fts.rowid
             WHERE memory_records_fts MATCH ?1
             ORDER BY bm25(memory_records_fts)
             LIMIT ?2",
        )?;
        stmt.query_map(params![escaped, limit.clamp(1, 50)], |row| {
            Ok(MemoryHit {
                id: row.get(0)?,
                thread_id: row.get(1)?,
                source: row.get(2)?,
                role: row.get(3)?,
                text: row.get(4)?,
                snippet: row.get(5)?,
                rank: row.get(6)?,
                ts_unix_ms: row.get(7)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Into::into)
    }

    fn insert_record(
        &self,
        source: &str,
        thread_id: &str,
        role: &str,
        text: &str,
        metadata: serde_json::Value,
        ts_unix_ms: i64,
    ) -> Result<i64> {
        let conn = self.db.conn();
        conn.execute(
            "INSERT INTO memory_records
             (ts_unix_ms, source, thread_id, role, text, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                ts_unix_ms,
                source,
                thread_id,
                role,
                text,
                serde_json::to_string(&metadata)?,
            ],
        )?;
        let id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO memory_records_fts(rowid, text, source, thread_id, role)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, text, source, thread_id, role],
        )?;
        Ok(id)
    }
}

fn fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .filter_map(|term| {
            let cleaned = term
                .chars()
                .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '-')
                .collect::<String>();
            if cleaned.is_empty() {
                None
            } else {
                Some(format!("\"{cleaned}\""))
            }
        })
        .collect::<Vec<_>>()
        .join(" OR ")
}
