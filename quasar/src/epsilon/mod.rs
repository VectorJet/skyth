//! Epsilon — Skyth's byte-level version control system.
//!
//! Epsilon snapshots:
//!
//! - Agent workspace.
//! - Private Quasar VFS.
//! - Per-project `.skyth/epsilon/` folders.
//! - User filesystem mounts when covered by Quasar administrative authority.
//!
//! Two operating modes (per spec):
//!
//! - [`Mode::EventBased`]: branches created in lockstep with Quasar events.
//! - [`Mode::TickBased`]:  snapshots all branches accumulated since last tick.
//!
//! Snapshot retention:
//!
//! - [`Retention::TimeBased`]: snapshot every interval; drop empty diffs (default).
//! - [`Retention::Unconstrained`]: keep every snapshot even when the diff is empty.
//!
//! Storage is content-addressed with content-defined chunking and
//! deduplication across snapshots. Epsilon never interprets logical
//! event semantics — it sees bytes; logical event awareness is Quasar's.

pub mod cdc;
pub mod restore;
pub mod snapshot;
pub mod store;

pub use cdc::{Chunk, chunk_bytes};
pub use restore::{PromptFn, Restore, RestoreDecision};
pub use snapshot::{Mode, Retention, Snapshot, SnapshotSummary};
pub use store::EpsilonStore;
