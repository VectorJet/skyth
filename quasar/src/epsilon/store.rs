//! Minimal filesystem-backed content-addressed chunk store.
//!
//! The detailed Epsilon chunk format is an open deferred area per spec —
//! this implementation pins the surface (put/get/has by hash) so callers
//! can wire snapshotting without committing to the on-disk layout.

use super::cdc::Chunk;
use super::snapshot::{Snapshot, SnapshotSummary};
use crate::error::Result;
use crate::paths;
use std::path::{Path, PathBuf};

/// Filesystem CAS rooted at `~/.skyth/epsilon/`.
pub struct EpsilonStore {
    root: PathBuf,
}

impl EpsilonStore {
    /// Open the default Epsilon root.
    pub fn open_default() -> Result<Self> {
        let root = paths::skyth_root()?.join("epsilon");
        paths::ensure_dir(&root)?;
        paths::ensure_dir(&root.join("chunks"))?;
        paths::ensure_dir(&root.join("snapshots"))?;
        Ok(Self { root })
    }

    pub fn open_at(root: PathBuf) -> Result<Self> {
        paths::ensure_dir(&root)?;
        paths::ensure_dir(&root.join("chunks"))?;
        paths::ensure_dir(&root.join("snapshots"))?;
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Write a chunk if not already present. Returns whether it was inserted.
    pub fn put_chunk(&self, chunk: &Chunk) -> Result<bool> {
        let path = self.chunk_path(&chunk.hash);
        if path.exists() {
            return Ok(false);
        }
        if let Some(parent) = path.parent() {
            paths::ensure_dir(parent)?;
        }
        std::fs::write(&path, &chunk.data)?;
        Ok(true)
    }

    pub fn has_chunk(&self, hash: &[u8; 32]) -> bool {
        self.chunk_path(hash).exists()
    }

    pub fn get_chunk(&self, hash: &[u8; 32]) -> Result<Option<Vec<u8>>> {
        let path = self.chunk_path(hash);
        if !path.exists() {
            return Ok(None);
        }
        Ok(Some(std::fs::read(path)?))
    }

    /// Helper: split `data` into chunks, store them, and return the hashes.
    pub fn write_bytes(&self, data: &[u8]) -> Result<Vec<[u8; 32]>> {
        let chunks = super::cdc::chunk_bytes(data);
        let mut hashes = Vec::new();
        for c in chunks {
            self.put_chunk(&c)?;
            hashes.push(c.hash);
        }
        Ok(hashes)
    }

    /// Helper: read chunks by hash and reconstruct the original bytes.
    pub fn read_bytes(&self, hashes: &[[u8; 32]]) -> Result<Vec<u8>> {
        let mut out = Vec::new();
        for h in hashes {
            let chunk = self.get_chunk(h)?.ok_or_else(|| {
                crate::error::Error::other(format!("missing chunk {}", hex::encode(h)))
            })?;
            out.extend_from_slice(&chunk);
        }
        Ok(out)
    }

    /// Persist a snapshot manifest. Returns the snapshot id.
    pub fn put_snapshot(&self, snap: &Snapshot) -> Result<String> {
        let path = self.root.join("snapshots").join(format!("{}.json", snap.id));
        let bytes = serde_json::to_vec_pretty(snap)?;
        std::fs::write(&path, bytes)?;
        Ok(snap.id.clone())
    }

    pub fn list_snapshots(&self) -> Result<Vec<SnapshotSummary>> {
        let dir = self.root.join("snapshots");
        let mut out = Vec::new();
        if !dir.exists() {
            return Ok(out);
        }
        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            let bytes = std::fs::read(entry.path())?;
            let snap: Snapshot = serde_json::from_slice(&bytes)?;
            let byte_size: u64 = snap
                .chunk_hashes
                .iter()
                .filter_map(|h| self.chunk_path(h).metadata().ok().map(|m| m.len()))
                .sum();
            out.push(SnapshotSummary {
                id: snap.id,
                branch_id: snap.branch.id,
                created_ms: snap.created_ms,
                chunk_count: snap.chunk_hashes.len(),
                byte_size,
            });
        }
        Ok(out)
    }

    fn chunk_path(&self, hash: &[u8; 32]) -> PathBuf {
        let hex = hex::encode(hash);
        // Fan out by first 2 chars to avoid huge flat directories.
        self.root
            .join("chunks")
            .join(&hex[..2])
            .join(&hex[2..])
    }
}
