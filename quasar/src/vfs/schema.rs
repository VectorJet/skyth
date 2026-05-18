//! VFS table layout, applied additively over the base schema.
//!
//! `vfs_entries` holds the *current* logical state of each (namespace, path).
//! Mutating operations append rows into the shared `events` table; the
//! current state row is updated to point at the latest event id so
//! history navigation stays cheap while reads stay simple.

pub const VFS_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS vfs_entries (
    namespace   TEXT NOT NULL,
    path        TEXT NOT NULL,
    size        INTEGER NOT NULL,
    created_ms  INTEGER NOT NULL,
    updated_ms  INTEGER NOT NULL,
    event_id    INTEGER NOT NULL,
    content     BLOB NOT NULL,
    PRIMARY KEY (namespace, path)
) STRICT;

CREATE INDEX IF NOT EXISTS vfs_entries_ns_idx ON vfs_entries (namespace);
"#;
