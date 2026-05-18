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
    /// Export VFS contents.
    QuasarExport {
        db_path: String,
        selector: crate::services::export::ExportSelector,
        dest_zip_path: String,
    },
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
    Ok,
    Error {
        message: String,
    },
}

/// Max accepted body size (1 MiB). Larger payloads should chunk via VFS.
pub const MAX_FRAME_BYTES: usize = 1024 * 1024;
