//! Quasar v1: Skyth's local state authority.
//!
//! Quasar owns durable state transitions across the Skyth ecosystem and
//! provides the storage, versioning, scheduling, and IPC primitives that
//! agents and surfaces use to coordinate work.
//!
//! Architectural primitives (per `specs/quasar/quasar-v1.md`):
//!
//! - Universal [`vfs`] abstraction over encrypted `*.quasardb` files.
//! - [`db`] open/init for SQLite + sqlite-vec + AES-256/Argon2id.
//! - [`auth`] for the global `auth.quasardb` (credentials, grants,
//!   device fingerprint).
//! - [`branch`] taxonomy: Solar (user), Nebula (agent/Quasar), Galaxy (exports).
//! - [`epsilon`] byte-level version control with content-defined chunking.
//! - [`ipc`] local API over Unix domain sockets or Windows named pipes.
//! - [`services`] for heartbeat, cron, gateway mediation, and export.
//!
//! Quasar is process-local, runs as the same OS user as Skyth, and never
//! exposes a network API in v1.

pub mod auth;
pub mod branch;
pub mod crypto;
pub mod db;
pub mod epsilon;
pub mod error;
pub mod fingerprint;
pub mod ipc;
pub mod paths;
pub mod services;
pub mod vfs;

pub use error::{Error, Result};
