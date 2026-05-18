//! Windows named pipe transport.
//!
//! Skeleton only — Tokio's `windows::named_pipe::NamedPipeServer` API is
//! the intended backing transport. v1 development happens on Unix
//! primarily; this is wired enough to compile and document the surface.

use super::server::IpcServer;
use crate::error::{Error, Result};
use std::sync::Arc;

pub async fn serve(_server: Arc<IpcServer>) -> Result<()> {
    Err(Error::NotImplemented(
        "windows named-pipe transport not yet implemented",
    ))
}
