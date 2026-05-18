//! Quasardb export.
//!
//! Export modes (per spec): full, by namespace, event range, agent,
//! memory type, or file path. Output is a zip or tar archive of VFS
//! contents; no mandatory re-encryption. Every export creates a Quasar
//! audit event *and* a Galaxy branch in Epsilon containing exactly the
//! exported contents.

use crate::branch::{BranchKind, BranchRef};
use crate::error::{Error, Result};
use crate::vfs::Namespace;
use serde::{Deserialize, Serialize};

/// Selector controlling which VFS contents to include.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ExportSelector {
    Full,
    Namespace(Namespace),
    EventRange { from_id: i64, to_id: i64 },
    Agent(String),
    MemoryType(String),
    Path { namespace: Namespace, path: String },
}

/// Output container format.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Zip,
    Tar,
}

/// Result of a completed export.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExportReceipt {
    pub archive_path: String,
    pub galaxy_branch: BranchRef,
    pub audit_event_id: i64,
}

/// Build a fresh Galaxy branch for an export. The branch *id* is fixed
/// at creation; archive emission is implemented by the runtime against
/// the [`crate::vfs::Vfs`] surface (deferred — selector→bytes wiring
/// requires the detailed VFS schema which is open in v1).
pub fn new_galaxy_branch(name: impl Into<String>) -> BranchRef {
    BranchRef::new(BranchKind::Galaxy, name, None)
}

/// Surface marker — concrete export implementation lives in the runtime.
pub fn placeholder_unimplemented(_selector: ExportSelector, _fmt: ExportFormat) -> Result<()> {
    Err(Error::NotImplemented(
        "export archive emission requires detailed VFS schema (deferred in v1 spec)",
    ))
}
