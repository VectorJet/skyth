//! Universal VFS abstraction.
//!
//! The VFS is the new primitive that replaces the old Quasar 5-layer
//! stack. It applies identically to `auth.quasardb`, `main.quasardb`,
//! and any custom quasardb.
//!
//! Required operations (per spec):
//!
//! - Namespaces.
//! - File paths.
//! - Read / write / edit.
//! - Delete (with policy hooks).
//! - Export by namespace / event range / agent / memory type / path.
//! - Audit event creation for relevant operations.
//! - Consistent access checks through `auth.quasardb`.

pub mod ops;
pub mod schema;
pub mod types;

pub use ops::Vfs;
pub use types::{Namespace, VfsEntry, VfsPath};
