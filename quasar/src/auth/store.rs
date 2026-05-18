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
    pub password_hash: String,
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

    /// Persist or update the onboarding username and password hash.
    pub fn set_identity(&mut self, username: &str, password: &[u8]) -> Result<()> {
        let salt = crate::crypto::kdf::random_salt();
        let params = crate::crypto::Argon2Params::default();
        let hash = crate::crypto::derive_key(password, &salt, &params)?;
        let hash_hex = hash.to_sqlcipher_hex();

        let tx = self.inner.conn_mut().transaction()?;
        tx.execute(
            "INSERT OR REPLACE INTO identity (key, value) VALUES ('username', ?1)",
            params![username],
        )?;
        tx.execute(
            "INSERT OR REPLACE INTO identity (key, value) VALUES ('password_hash', ?1)",
            params![hash_hex],
        )?;
        tx.commit()?;
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
        let password_hash: Option<String> = self
            .inner
            .conn()
            .query_row(
                "SELECT value FROM identity WHERE key = 'password_hash'",
                [],
                |row| row.get(0),
            )
            .optional()?;

        match (username, password_hash) {
            (Some(u), Some(p)) => Ok(Some(Identity {
                username: u,
                password_hash: p,
            })),
            _ => Ok(None),
        }
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
