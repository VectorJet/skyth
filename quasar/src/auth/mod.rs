//! `auth.quasardb` — the global ACL layer and cryptographic root of trust.
//!
//! Contents are deliberately minimal per the v1 spec:
//!
//! - Username + superuser password material (set at onboarding).
//! - Per-quasardb permission grants (read/write/etc).
//! - Device fingerprint (raw system strings are never stored).
//!
//! Anything else (general policy, memory, app config, event logs) belongs
//! in `main.quasardb` or a custom quasardb, never here.

pub mod permissions;
pub mod store;

pub use permissions::{GENERALIST_ID, Grant, PermissionScope, PermissionStore, Right};
pub use store::AuthDb;
