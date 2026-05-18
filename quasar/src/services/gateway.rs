//! Gateway mediation surface.
//!
//! Per the v1 spec, the gateway is the single chokepoint for every
//! agent ↔ Quasar interaction. Its required responsibilities are:
//!
//! - Authenticate IPC clients.
//! - Route agent requests to Quasar.
//! - Enforce operation mediation (delete prompts, permission checks).
//! - Preserve Quasar's scheduling priority (Quasar messages first).
//! - Record or forward audit events.
//! - Keep all Quasar access local.
//!
//! This module declares the trait the IPC server consults; the concrete
//! implementation lives upstream in the Skyth runtime to avoid coupling
//! Quasar to runtime-specific scheduling.

use crate::auth::Right;
use crate::error::Result;
use crate::vfs::{Namespace, VfsPath};
use std::path::Path;

/// Action requiring user-facing approval mediation by the gateway.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MediatedAction {
    DeleteVfsEntry {
        db_path: String,
        namespace: String,
        path: String,
    },
    DeleteDatabase {
        db_path: String,
    },
}

/// Decision returned by the gateway prompt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Deny,
}

/// Surface the IPC server consults for permission + prompt enforcement.
pub trait Gateway: Send + Sync {
    fn authenticate(&self, peer_cred_hint: Option<&str>) -> Result<String>;

    fn check_permission(
        &self,
        agent_id: &str,
        right: Right,
        db_path: &Path,
        namespace: Option<&Namespace>,
        path: Option<&VfsPath>,
    ) -> Result<bool>;

    fn prompt(&self, action: &MediatedAction) -> Result<Decision>;

    fn record_audit(&self, actor: &str, action: &str, detail: &str) -> Result<()>;
}
