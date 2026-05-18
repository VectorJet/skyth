//! Thin wrapper that opens `auth.quasardb` and ensures its schema.

use crate::db::{OpenMode, QuasarDb, open_or_init};
use crate::error::Result;
use crate::fingerprint::DeviceFingerprint;
use crate::paths;
use rusqlite::params;
use std::path::PathBuf;

/// Identity stored at onboarding.
#[derive(Clone, Debug)]
pub struct Identity {
    pub username: String,
}

/// Opened, unlocked `auth.quasardb` handle.
pub struct AuthDb {
    inner: QuasarDb,
}

impl AuthDb {
    /// Resolve the default path under `~/.skyth/auth.quasardb`.
    pub fn default_path() -> Result<PathBuf> {
        paths::auth_db_path()
    }

    /// Open the auth db, creating it if missing (onboarding flow).
    pub fn open_or_init(password: &[u8], fingerprint: &DeviceFingerprint) -> Result<Self> {
        let path = Self::default_path()?;
        let mode = OpenMode::CreateIfMissing {
            db_kind: "auth".into(),
        };
        let mut inner = open_or_init(&path, password, mode, fingerprint)?;
        super::permissions::PermissionStore::ensure_schema(inner.conn())?;
        ensure_identity_schema(inner.conn_mut())?;
        Ok(Self { inner })
    }

    pub fn inner(&self) -> &QuasarDb {
        &self.inner
    }

    /// Persist or update the onboarding username.
    pub fn set_username(&self, username: &str) -> Result<()> {
        self.inner.conn().execute(
            "INSERT OR REPLACE INTO identity (key, value) VALUES ('username', ?1)",
            params![username],
        )?;
        Ok(())
    }

    pub fn identity(&self) -> Result<Option<Identity>> {
        use rusqlite::OptionalExtension;
        let username: Option<String> = self
            .inner
            .conn()
            .query_row(
                "SELECT value FROM identity WHERE key = 'username'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        Ok(username.map(|u| Identity { username: u }))
    }
}

fn ensure_identity_schema(conn: &mut rusqlite::Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS identity (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        ) STRICT;
        "#,
    )?;
    Ok(())
}
