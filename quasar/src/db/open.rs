//! Open or initialize an encrypted quasardb.
//!
//! ## Bootstrap chicken-and-egg
//!
//! SQLCipher needs the key before it can read a single byte. The key
//! itself is derived from the user's superuser password and a
//! per-database random salt — but that salt lives inside the database.
//!
//! Quasar resolves this with a small plaintext **header sidecar** at
//! `{db}.header` holding:
//!
//! - Argon2id salt + params (needed to derive the SQLCipher key).
//! - The device fingerprint at creation time (required for primary unlock).
//! - The sealed database password (for the deferred recovery path).
//! - The schema version (for online migrations later).
//!
//! The actual database bytes remain SQLCipher-encrypted at rest.

use crate::crypto::{Argon2Params, DerivedKey, SealedBlob, derive_key, kdf, seal};
use crate::db::schema::{self, meta_keys};
use crate::error::{Error, Result};
use crate::fingerprint::DeviceFingerprint;
use rusqlite::{Connection, OpenFlags, params};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Header sidecar written next to every quasardb.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DbHeader {
    pub schema_version: u32,
    pub salt: Vec<u8>,
    pub argon2: Argon2Params,
    pub fingerprint_hex: String,
    pub sealed_password: SealedBlob,
    pub db_kind: String,
}

/// How to open a quasardb.
#[derive(Clone, Debug)]
pub enum OpenMode {
    /// Create the database if it does not exist. Caller must supply the
    /// db kind label used in the header (e.g. `"auth"`, `"main"`, `"custom"`).
    CreateIfMissing { db_kind: String },
    /// Fail if the database does not exist.
    OpenExisting,
}

/// An opened quasardb. Closes the underlying SQLite handle on drop.
pub struct QuasarDb {
    conn: Connection,
    path: PathBuf,
    header: DbHeader,
}

impl std::fmt::Debug for QuasarDb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("QuasarDb")
            .field("path", &self.path)
            .field("db_kind", &self.header.db_kind)
            .finish()
    }
}

impl QuasarDb {
    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    pub fn conn_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn header(&self) -> &DbHeader {
        &self.header
    }
}

/// Open or initialize a quasardb at `path`, unlocking with `password`.
///
/// On `CreateIfMissing`, a fresh random salt + database password are
/// generated, the SQLCipher key is derived, base schema is applied, and
/// a header sidecar is written.
pub fn open_or_init(
    path: &Path,
    password: &[u8],
    mode: OpenMode,
    fingerprint: &DeviceFingerprint,
) -> Result<QuasarDb> {
    let header_path = sidecar_path(path);
    let exists = path.exists() && header_path.exists();

    match (exists, mode) {
        (true, _) => open_existing(path, &header_path, password, fingerprint),
        (false, OpenMode::CreateIfMissing { db_kind }) => {
            create_new(path, &header_path, password, fingerprint, &db_kind)
        }
        (false, OpenMode::OpenExisting) => Err(Error::NotFound(path.to_path_buf())),
    }
}

fn open_existing(
    path: &Path,
    header_path: &Path,
    password: &[u8],
    fingerprint: &DeviceFingerprint,
) -> Result<QuasarDb> {
    let header = read_header(header_path)?;
    if header.fingerprint_hex != fingerprint.to_hex() {
        return Err(Error::FingerprintMismatch);
    }
    let key = derive_key(password, &header.salt, &header.argon2)?;
    let conn = open_with_key(path, &key)?;
    verify_key(&conn)?;
    apply_runtime_pragmas(&conn)?;
    Ok(QuasarDb {
        conn,
        path: path.to_path_buf(),
        header,
    })
}

fn create_new(
    path: &Path,
    header_path: &Path,
    password: &[u8],
    fingerprint: &DeviceFingerprint,
    db_kind: &str,
) -> Result<QuasarDb> {
    if let Some(parent) = path.parent() {
        crate::paths::ensure_dir(parent)?;
    }
    let salt = kdf::random_salt();
    let argon2 = Argon2Params::default();
    let key = derive_key(password, &salt, &argon2)?;

    // Generate a per-database password, seal it under the derived key.
    let mut db_password = [0u8; 32];
    {
        use rand::TryRngCore;
        rand::rngs::OsRng
            .try_fill_bytes(&mut db_password)
            .map_err(|e| Error::Crypto(format!("os rng failed: {e}")))?;
    }
    let sealed_password = seal(key.as_bytes(), &db_password)?;

    let conn = open_with_key(path, &key)?;
    apply_runtime_pragmas(&conn)?;
    init_schema(&conn, db_kind, &salt, &argon2, &sealed_password)?;

    let header = DbHeader {
        schema_version: schema::CURRENT_SCHEMA_VERSION,
        salt: salt.to_vec(),
        argon2,
        fingerprint_hex: fingerprint.to_hex(),
        sealed_password,
        db_kind: db_kind.to_string(),
    };
    write_header(header_path, &header)?;

    Ok(QuasarDb {
        conn,
        path: path.to_path_buf(),
        header,
    })
}

fn open_with_key(path: &Path, key: &DerivedKey) -> Result<Connection> {
    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE;
    let conn = Connection::open_with_flags(path, flags)?;
    // SQLCipher: supply the key as an exact 32-byte raw hex value.
    conn.pragma_update(None, "key", format!("x'{}'", key.to_sqlcipher_hex()))?;
    Ok(conn)
}

/// Apply non-cipher pragmas. Must run only after the key has been verified,
/// because pragmas that touch storage (journal_mode) fail noisily on a
/// wrong key and mask the real authentication error.
fn apply_runtime_pragmas(conn: &Connection) -> Result<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    Ok(())
}

fn verify_key(conn: &Connection) -> Result<()> {
    // Force SQLCipher to read a page; wrong key surfaces here.
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))
        .map_err(|_| Error::AuthFailed)
}

fn init_schema(
    conn: &Connection,
    db_kind: &str,
    salt: &[u8],
    argon2: &Argon2Params,
    sealed: &SealedBlob,
) -> Result<()> {
    conn.execute_batch(&schema::base_schema_sql())?;
    let now_ms = chrono::Utc::now().timestamp_millis();
    let argon2_json = serde_json::to_vec(argon2)?;
    let sealed_json = serde_json::to_vec(sealed)?;

    let mut stmt =
        conn.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)")?;
    stmt.execute(params![
        meta_keys::SCHEMA_VERSION,
        schema::CURRENT_SCHEMA_VERSION.to_be_bytes().to_vec()
    ])?;
    stmt.execute(params![meta_keys::CREATED_AT, now_ms.to_be_bytes().to_vec()])?;
    stmt.execute(params![meta_keys::DB_KIND, db_kind.as_bytes().to_vec()])?;
    stmt.execute(params![meta_keys::ARGON2_SALT, salt.to_vec()])?;
    stmt.execute(params![meta_keys::ARGON2_PARAMS, argon2_json])?;
    stmt.execute(params![meta_keys::SEALED_PASSWORD, sealed_json])?;
    Ok(())
}

fn sidecar_path(db_path: &Path) -> PathBuf {
    let mut s = db_path.as_os_str().to_owned();
    s.push(".header");
    PathBuf::from(s)
}

fn read_header(header_path: &Path) -> Result<DbHeader> {
    let bytes = std::fs::read(header_path)?;
    let header: DbHeader = serde_json::from_slice(&bytes)?;
    Ok(header)
}

fn write_header(header_path: &Path, header: &DbHeader) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(header)?;
    std::fs::write(header_path, bytes)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn create_then_open_roundtrip() {
        let tmp = TempDir::new().unwrap();
        let db = tmp.path().join("test.quasardb");
        let fp = DeviceFingerprint::from_bytes([42u8; 32]);

        // First create
        {
            let mut q = open_or_init(
                &db,
                b"pw",
                OpenMode::CreateIfMissing {
                    db_kind: "main".into(),
                },
                &fp,
            )
            .unwrap();
            // Patch params to weak for test speed by re-running with stored salt.
            let _ = &mut q;
        }

        // Re-open
        let q = open_or_init(&db, b"pw", OpenMode::OpenExisting, &fp).unwrap();
        assert_eq!(q.header().db_kind, "main");
    }

    #[test]
    fn wrong_password_fails() {
        let tmp = TempDir::new().unwrap();
        let db = tmp.path().join("a.quasardb");
        let fp = DeviceFingerprint::from_bytes([1u8; 32]);
        open_or_init(
            &db,
            b"correct",
            OpenMode::CreateIfMissing {
                db_kind: "main".into(),
            },
            &fp,
        )
        .unwrap();
        let err = open_or_init(&db, b"wrong", OpenMode::OpenExisting, &fp).unwrap_err();
        assert!(matches!(err, Error::AuthFailed));
    }

    #[test]
    fn wrong_fingerprint_fails() {
        let tmp = TempDir::new().unwrap();
        let db = tmp.path().join("a.quasardb");
        let fp = DeviceFingerprint::from_bytes([1u8; 32]);
        open_or_init(
            &db,
            b"pw",
            OpenMode::CreateIfMissing {
                db_kind: "main".into(),
            },
            &fp,
        )
        .unwrap();
        let other = DeviceFingerprint::from_bytes([2u8; 32]);
        let err = open_or_init(&db, b"pw", OpenMode::OpenExisting, &other).unwrap_err();
        assert!(matches!(err, Error::FingerprintMismatch));
    }
}
