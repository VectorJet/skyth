//! Branch taxonomy shared by Quasar and Epsilon.
//!
//! Quasar and Epsilon live on one unified graph. Three branch kinds:
//!
//! - [`BranchKind::Solar`]  — direct user edits.
//! - [`BranchKind::Nebula`] — agent or Quasar changes.
//! - [`BranchKind::Galaxy`] — exports.
//!
//! Conflict policy (per spec, no global winner):
//!
//! 1. A user direct edit forks a Solar branch.
//! 2. A concurrent agent/Quasar change forks a Nebula branch.
//! 3. Epsilon switches to Solar immediately when the user edit takes
//!    effect.
//! 4. Branches merge back into `main`; the agent handles conflict
//!    resolution.

use serde::{Deserialize, Serialize};

/// Kind of branch on the shared graph.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BranchKind {
    Solar,
    Nebula,
    Galaxy,
}

impl BranchKind {
    pub fn as_str(self) -> &'static str {
        match self {
            BranchKind::Solar => "solar",
            BranchKind::Nebula => "nebula",
            BranchKind::Galaxy => "galaxy",
        }
    }
}

/// Logical branch reference (id + kind + name).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BranchRef {
    pub id: String,
    pub kind: BranchKind,
    pub name: String,
    pub parent: Option<String>,
}

impl BranchRef {
    pub fn new(kind: BranchKind, name: impl Into<String>, parent: Option<String>) -> Self {
        Self {
            id: uuid::Uuid::now_v7().to_string(),
            kind,
            name: name.into(),
            parent,
        }
    }
}
