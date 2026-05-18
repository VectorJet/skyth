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
    Unlock {
        password_b64: String,
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
    Ok,
    Error {
        message: String,
    },
}

/// Max accepted body size (1 MiB). Larger payloads should chunk via VFS.
pub const MAX_FRAME_BYTES: usize = 1024 * 1024;
