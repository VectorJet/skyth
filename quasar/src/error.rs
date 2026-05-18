//! Quasar error types.

use std::io;
use std::path::PathBuf;

/// Result alias used throughout the Quasar crate.
pub type Result<T> = std::result::Result<T, Error>;

/// Top-level Quasar error.
///
/// Variants are kept coarse-grained on purpose; callers that need finer
/// detail can inspect the wrapped source via [`std::error::Error::source`].
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("io error: {0}")]
    Io(#[from] io::Error),

    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("zip error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("invalid path: {0}")]
    InvalidPath(PathBuf),

    #[error("quasardb not found: {0}")]
    NotFound(PathBuf),

    #[error("authentication failed")]
    AuthFailed,

    #[error("device fingerprint mismatch")]
    FingerprintMismatch,

    #[error("permission denied: {0}")]
    PermissionDenied(String),

    #[error("crypto error: {0}")]
    Crypto(String),

    #[error("not implemented: {0}")]
    NotImplemented(&'static str),

    #[error("{0}")]
    Other(String),
}

impl Error {
    /// Convenience constructor for free-form errors.
    pub fn other(msg: impl Into<String>) -> Self {
        Self::Other(msg.into())
    }
}
