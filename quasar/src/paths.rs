//! Filesystem path resolution for Quasar storage.
//!
//! All durable Quasar state lives under `~/.skyth/`. Per-agent quasardbs
//! live under `~/.skyth/agents/{agent_id}/private/`. The `auth.quasardb`
//! file is global and lives at the Skyth root.

use crate::error::{Error, Result};
use std::path::{Path, PathBuf};

/// Name of the global auth database file.
pub const AUTH_DB_FILENAME: &str = "auth.quasardb";

/// Name of the default per-scope main database file.
pub const MAIN_DB_FILENAME: &str = "main.quasardb";

/// Subdirectory under each agent root that holds private quasardbs.
pub const AGENT_PRIVATE_DIR: &str = "private";

/// Returns the Skyth root directory: `~/.skyth/`.
///
/// Honors `$SKYTH_HOME` if set, otherwise resolves the user's home directory.
pub fn skyth_root() -> Result<PathBuf> {
    if let Ok(override_path) = std::env::var("SKYTH_HOME") {
        let p = PathBuf::from(override_path);
        return Ok(p);
    }
    let home = dirs::home_dir().ok_or_else(|| Error::other("could not resolve home directory"))?;
    Ok(home.join(".skyth"))
}

/// Returns the path to the global `auth.quasardb`.
pub fn auth_db_path() -> Result<PathBuf> {
    Ok(skyth_root()?.join(AUTH_DB_FILENAME))
}

/// Returns the directory holding per-agent private quasardbs:
/// `~/.skyth/agents/{agent_id}/private/`.
pub fn agent_private_dir(agent_id: &str) -> Result<PathBuf> {
    validate_agent_id(agent_id)?;
    Ok(skyth_root()?
        .join("agents")
        .join(agent_id)
        .join(AGENT_PRIVATE_DIR))
}

/// Returns the default per-agent main database path.
pub fn agent_main_db_path(agent_id: &str) -> Result<PathBuf> {
    Ok(agent_private_dir(agent_id)?.join(MAIN_DB_FILENAME))
}

/// Returns the global main database path (the default when `main.quasardb`
/// is configured globally rather than per-agent).
pub fn global_main_db_path() -> Result<PathBuf> {
    Ok(skyth_root()?.join(MAIN_DB_FILENAME))
}

/// Path to the IPC socket / named pipe endpoint.
///
/// Linux/macOS: `~/.skyth/quasar.sock`
/// Windows: `\\.\pipe\skyth-quasar` (returned as a [`PathBuf`] for uniformity).
pub fn ipc_endpoint() -> Result<PathBuf> {
    #[cfg(windows)]
    {
        Ok(PathBuf::from(r"\\.\pipe\skyth-quasar"))
    }
    #[cfg(not(windows))]
    {
        Ok(skyth_root()?.join("quasar.sock"))
    }
}

/// Ensures `dir` exists with owner-only permissions where supported.
pub fn ensure_dir(dir: &Path) -> Result<()> {
    if !dir.exists() {
        std::fs::create_dir_all(dir)?;
    }
    tighten_dir_permissions(dir)?;
    Ok(())
}

fn tighten_dir_permissions(dir: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
    }
    #[cfg(not(unix))]
    {
        let _ = dir;
    }
    Ok(())
}

fn validate_agent_id(agent_id: &str) -> Result<()> {
    if agent_id.is_empty()
        || agent_id.contains('/')
        || agent_id.contains('\\')
        || agent_id.contains("..")
    {
        return Err(Error::InvalidPath(PathBuf::from(agent_id)));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_agent_ids() {
        assert!(agent_private_dir("..").is_err());
        assert!(agent_private_dir("a/b").is_err());
        assert!(agent_private_dir("").is_err());
    }

    #[test]
    fn accepts_simple_agent_ids() {
        assert!(agent_private_dir("generalist").is_ok());
    }
}
