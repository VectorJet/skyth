//! Snapshot value types and operating-mode enums.

use crate::branch::BranchRef;
use serde::{Deserialize, Serialize};

/// Operating mode that decides when Epsilon creates branches.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    /// Branch in lockstep with each Quasar event.
    EventBased,
    /// Snapshot all branches accumulated since the last tick.
    TickBased { interval_ms: u64 },
}

impl Default for Mode {
    fn default() -> Self {
        // Time-based snapshots at 60 s ticks; matches the v1 default note
        // that time-based mode is the default snapshot retention policy.
        Mode::TickBased { interval_ms: 60_000 }
    }
}

/// What to do with empty-diff snapshots.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Retention {
    /// Drop the snapshot if the diff against the previous snapshot is empty.
    TimeBased,
    /// Keep every snapshot regardless of diff.
    Unconstrained,
}

impl Default for Retention {
    fn default() -> Self {
        Retention::TimeBased
    }
}

/// Persisted snapshot record.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub branch: BranchRef,
    pub created_ms: i64,
    /// Hashes of the chunks that compose this snapshot, in order.
    pub chunk_hashes: Vec<[u8; 32]>,
}

/// Cheap summary returned by listing operations.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SnapshotSummary {
    pub id: String,
    pub branch_id: String,
    pub created_ms: i64,
    pub chunk_count: usize,
    pub byte_size: u64,
}
