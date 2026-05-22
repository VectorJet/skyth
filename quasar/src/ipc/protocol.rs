//! IPC wire envelope.
//!
//! Framing: 4-byte big-endian length prefix followed by a UTF-8 JSON
//! body. Bodies are [`Request`] or [`Response`] structures. The set of
//! [`RequestKind`] variants below is intentionally small in v1 — enough
//! to wire onboarding, health, and basic VFS round-trips. The detailed
//! schema (additional verbs, batched ops) is deferred per spec.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Request {
    pub id: String,
    pub actor: String,
    pub kind: RequestKind,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum RequestKind {
    /// Liveness check.
    Ping,
    /// Returns server build info + auth-db status.
    Status,
    /// Initialize auth.quasardb (username, password, fingerprint).
    Onboard {
        username: String,
        password_b64: String,
    },
    /// Unlock the system using the superuser password.
    Unlock { password_b64: String },
    /// Open or create a quasardb so later VFS calls can address it.
    DbOpen {
        db_path: String,
        db_kind: String,
        create_if_missing: bool,
    },
    /// Read a VFS path.
    VfsRead {
        db_path: String,
        namespace: String,
        path: String,
    },
    /// Write a VFS path.
    VfsWrite {
        db_path: String,
        namespace: String,
        path: String,
        content_b64: String,
    },
    /// Delete a VFS path (gateway-mediated prompt happens above this).
    VfsDelete {
        db_path: String,
        namespace: String,
        path: String,
    },
    /// List entries in a VFS namespace.
    VfsList { db_path: String, namespace: String },
    /// Create an Epsilon snapshot of a VFS path.
    EpsilonSnapshot {
        db_path: String,
        namespace: String,
        path: String,
        branch_name: String,
    },
    /// Restore a VFS path from an Epsilon snapshot.
    EpsilonRestore {
        snapshot_id: String,
        dest_path: String,
    },
    /// Append a heartbeat entry.
    HeartbeatAppend { kind: String, note: Option<String> },
    /// Register a cron job.
    CronRegister {
        schedule: String,
        target_agent_id: String,
        payload: serde_json::Value,
    },
    /// Add a user-origin queue item.
    QueuePushUser {
        db_path: String,
        payload: String,
        ts: i64,
        enqueued_at: i64,
    },
    /// Add a gateway-origin queue item, optionally collapsing by tag.
    QueuePushGateway {
        db_path: String,
        payload: String,
        tag: Option<String>,
        ts: i64,
        enqueued_at: i64,
    },
    /// Atomically claim all pending queue rows.
    QueueClaimAll { db_path: String },
    /// Mark queue rows done.
    QueueMarkDone { db_path: String, ids: Vec<i64> },
    /// Release queue rows back to pending.
    QueueReleaseInflight { db_path: String, ids: Vec<i64> },
    /// Return pending queue counts.
    QueuePendingStats { db_path: String },
    /// Record a state transition in Quasar-owned state storage.
    StateRecord {
        db_path: String,
        domain: String,
        from_state: Option<String>,
        to_state: String,
        reason: Option<String>,
        metadata: serde_json::Value,
    },
    /// Return the latest transition for a domain.
    StateLatest { db_path: String, domain: String },
    /// Record a gateway turn in Quasar memory.
    MemoryRecordGatewayTurn {
        db_path: String,
        channel: String,
        chat_id: String,
        user_text: Option<String>,
        assistant_text: Option<String>,
        user_message_id: Option<String>,
        ts_unix_ms: i64,
    },
    /// Search Quasar memory.
    MemorySearch {
        db_path: String,
        query: String,
        limit: i64,
    },
    /// Export VFS contents.
    QuasarExport {
        db_path: String,
        selector: crate::services::export::ExportSelector,
        dest_zip_path: String,
    },
    /// Record an agent run/session event in Quasar.
    RunEventRecord {
        db_path: String,
        run_id: String,
        thread_id: Option<String>,
        step_index: Option<i64>,
        sequence: i64,
        event_type: String,
        payload: serde_json::Value,
    },
    /// List recorded run/session events for a given run id.
    RunEventList { db_path: String, run_id: String },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Response {
    pub id: String,
    pub kind: ResponseKind,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum ResponseKind {
    Pong,
    Status {
        version: String,
        auth_initialized: bool,
    },
    VfsBytes {
        content_b64: Option<String>,
    },
    VfsEventId {
        event_id: i64,
    },
    VfsEntries {
        entries: Vec<crate::vfs::VfsEntry>,
    },
    DbOpened {
        db_path: String,
        db_kind: String,
    },
    SnapshotId {
        snapshot_id: String,
    },
    ExportReceipt {
        receipt: crate::services::export::ExportReceipt,
    },
    QueueRowId {
        id: i64,
    },
    QueueRows {
        rows: Vec<crate::services::queue::QueueRow>,
    },
    QueueStats {
        stats: crate::services::queue::QueueStats,
    },
    StateTransitionId {
        id: i64,
    },
    StateTransition {
        transition: Option<crate::services::state_store::StateTransition>,
    },
    MemoryRecordIds {
        ids: Vec<i64>,
    },
    MemoryHits {
        hits: Vec<crate::services::memory::MemoryHit>,
    },
    RunEventId {
        id: i64,
    },
    RunEventRows {
        rows: Vec<crate::services::run_events::RunEventRow>,
    },
    Ok,
    Error {
        message: String,
    },
}

/// Max accepted body size (1 MiB). Larger payloads should chunk via VFS.
pub const MAX_FRAME_BYTES: usize = 1024 * 1024;
