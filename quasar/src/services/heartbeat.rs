//! Heartbeat service.
//!
//! Per spec, heartbeats are:
//!
//! - Routed only to the Generalist.
//! - Non-delegatable.
//! - Stored in `HEARTBEAT.md` with YAML frontmatter between `---` separators.

use crate::error::Result;
use crate::paths;
use std::path::PathBuf;

const HEARTBEAT_FILENAME: &str = "HEARTBEAT.md";

/// A single heartbeat record persisted as YAML frontmatter.
#[derive(Clone, Debug)]
pub struct HeartbeatEntry {
    pub ts_unix_ms: i64,
    pub kind: String,
    pub note: Option<String>,
}

pub struct Heartbeat {
    path: PathBuf,
}

impl Heartbeat {
    pub fn open_default() -> Result<Self> {
        let root = paths::skyth_root()?;
        paths::ensure_dir(&root)?;
        Ok(Self {
            path: root.join(HEARTBEAT_FILENAME),
        })
    }

    pub fn path(&self) -> &std::path::Path {
        &self.path
    }

    /// Append an entry. Writes a fresh `---` YAML block then a body line.
    pub fn append(&self, entry: &HeartbeatEntry) -> Result<()> {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        let body = format!(
            "---\nts_unix_ms: {}\nkind: {}\nnote: {}\n---\n\n",
            entry.ts_unix_ms,
            entry.kind,
            entry.note.as_deref().unwrap_or(""),
        );
        file.write_all(body.as_bytes())?;
        Ok(())
    }
}
