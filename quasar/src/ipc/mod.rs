//! Local IPC for Quasar.
//!
//! Per spec, Quasar v1 exposes a **local** API only:
//!
//! - Unix domain sockets on Linux/macOS.
//! - Named pipes on Windows.
//!
//! No network API. The gateway is the single authenticated client; it
//! authenticates IPC peers, routes agent requests, enforces operation
//! mediation, preserves Quasar's scheduling priority, and records or
//! forwards audit events.
//!
//! The detailed IPC message schema is explicitly deferred — [`protocol`]
//! pins the framing and a stable request/response envelope so callers
//! can build on top without churn.

pub mod protocol;
pub mod server;
#[cfg(unix)]
pub mod unix;
#[cfg(windows)]
pub mod windows_pipe;

pub use protocol::{Request, Response, RequestKind, ResponseKind};
pub use server::IpcServer;
