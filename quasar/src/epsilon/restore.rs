//! Restore operations.
//!
//! Per spec, Epsilon may restore user filesystem mounts; restore requires
//! one user prompt before it starts. The append-only Quasar history means
//! restore is forward/backward navigation, not destructive rollback.

use super::snapshot::Snapshot;
use super::store::EpsilonStore;
use crate::error::{Error, Result};
use std::path::{Path, PathBuf};

/// Decision returned by the user prompt before restore proceeds.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RestoreDecision {
    Approve,
    Deny,
}

/// Function signature the IPC/CLI binds for the mandatory pre-restore prompt.
pub type PromptFn = Box<dyn Fn(&Snapshot, &Path) -> RestoreDecision + Send + Sync>;

pub struct Restore<'a> {
    store: &'a EpsilonStore,
    prompt: PromptFn,
}

impl<'a> Restore<'a> {
    pub fn new(store: &'a EpsilonStore, prompt: PromptFn) -> Self {
        Self { store, prompt }
    }

    /// Restore `snap` into `dest`. Prompts first; aborts if denied.
    ///
    /// Concatenates chunks in order. Detailed file-tree layout inside a
    /// snapshot is deferred — current callers pass per-file snapshots.
    pub fn restore_to(&self, snap: &Snapshot, dest: &Path) -> Result<PathBuf> {
        match (self.prompt)(snap, dest) {
            RestoreDecision::Deny => Err(Error::PermissionDenied("restore denied by user".into())),
            RestoreDecision::Approve => {
                if let Some(parent) = dest.parent() {
                    crate::paths::ensure_dir(parent)?;
                }
                let mut buf = Vec::new();
                for hash in &snap.chunk_hashes {
                    let chunk = self
                        .store
                        .get_chunk(hash)
                        .map_err(|e| Error::other(format!("missing chunk: {e}")))?
                        .ok_or_else(|| Error::other("missing chunk in store"))?;
                    buf.extend_from_slice(&chunk);
                }
                std::fs::write(dest, &buf)?;
                Ok(dest.to_path_buf())
            }
        }
    }
}
