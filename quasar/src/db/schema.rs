//! Base schema applied to every quasardb on init.
//!
//! Only the cross-cutting metadata + append-only event tables live here.
//! Domain-specific schemas (auth grants, VFS namespaces, Epsilon chunks)
//! are owned by their respective modules and applied additively at open
//! time. Detailed schemas are explicitly deferred in `quasar-v1.md`.

/// `meta` holds small key/value rows that describe the database itself:
/// schema version, Argon2 params, salt, creation time, sealed password.
pub const META_TABLE: &str = r#"
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value BLOB NOT NULL
) STRICT;
"#;

/// `events` is the append-only event log shared by VFS + state ownership.
/// In-place mutation is forbidden by the v1 spec; updates land as new rows.
pub const EVENTS_TABLE: &str = r#"
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_unix_ms  INTEGER NOT NULL,
    kind        TEXT NOT NULL,
    namespace   TEXT,
    path        TEXT,
    actor       TEXT,
    payload     BLOB
) STRICT;

CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts_unix_ms);
CREATE INDEX IF NOT EXISTS events_ns_path_idx ON events (namespace, path);
"#;

/// `audit` records security-relevant operations: opens, exports, deletes,
/// permission grants, restore prompts, and so on.
pub const AUDIT_TABLE: &str = r#"
CREATE TABLE IF NOT EXISTS audit (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_unix_ms  INTEGER NOT NULL,
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL,
    target      TEXT,
    detail      TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS audit_ts_idx ON audit (ts_unix_ms);
"#;

/// All base statements concatenated, runnable with `execute_batch`.
pub fn base_schema_sql() -> String {
    [META_TABLE, EVENTS_TABLE, AUDIT_TABLE].concat()
}

/// Meta keys with stable string values.
pub mod meta_keys {
    pub const SCHEMA_VERSION: &str = "quasar.schema_version";
    pub const CREATED_AT: &str = "quasar.created_at";
    pub const ARGON2_PARAMS: &str = "quasar.argon2_params";
    pub const ARGON2_SALT: &str = "quasar.argon2_salt";
    pub const SEALED_PASSWORD: &str = "quasar.sealed_password";
    pub const DB_KIND: &str = "quasar.db_kind";
}

/// Current schema version. Bump when the base schema changes.
pub const CURRENT_SCHEMA_VERSION: u32 = 1;
