//! Transport-agnostic IPC server.
//!
//! The platform-specific binding lives in [`super::unix`] (Linux/macOS)
//! or [`super::windows_pipe`] (Windows). Both delegate to
//! [`IpcServer::handle_request`] for request routing.

use super::protocol::{Request, Response, ResponseKind, MAX_FRAME_BYTES};
use crate::error::{Error, Result};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Server state shared across connections.
pub struct IpcServer {
    version: String,
    // Future: gateway handle, auth db handle, vfs router.
}

impl IpcServer {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
        })
    }

    /// Route a parsed request to a response. Pure function over server state.
    pub fn handle_request(&self, req: Request) -> Response {
        use super::protocol::RequestKind::*;
        let kind = match req.kind {
            Ping => ResponseKind::Pong,
            Status => ResponseKind::Status {
                version: self.version.clone(),
                // TODO(quasar/auth): probe AuthDb once gateway wiring lands.
                auth_initialized: false,
            },
            VfsRead { .. } | VfsWrite { .. } | VfsDelete { .. } => ResponseKind::Error {
                message: "vfs ops require gateway-mediated handler (wiring pending)".into(),
            },
        };
        Response { id: req.id, kind }
    }

    /// Read one length-prefixed JSON frame from `stream`.
    pub async fn read_frame<R: AsyncReadExt + Unpin>(stream: &mut R) -> Result<Request> {
        let mut len_buf = [0u8; 4];
        stream.read_exact(&mut len_buf).await?;
        let len = u32::from_be_bytes(len_buf) as usize;
        if len > MAX_FRAME_BYTES {
            return Err(Error::other(format!("frame too large: {len} bytes")));
        }
        let mut body = vec![0u8; len];
        stream.read_exact(&mut body).await?;
        let req: Request = serde_json::from_slice(&body)?;
        Ok(req)
    }

    /// Write one length-prefixed JSON frame to `stream`.
    pub async fn write_frame<W: AsyncWriteExt + Unpin>(
        stream: &mut W,
        resp: &Response,
    ) -> Result<()> {
        let body = serde_json::to_vec(resp)?;
        let len = (body.len() as u32).to_be_bytes();
        stream.write_all(&len).await?;
        stream.write_all(&body).await?;
        stream.flush().await?;
        Ok(())
    }
}
